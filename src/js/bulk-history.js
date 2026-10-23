import {
  DOWNLOAD_HISTORY_LIMIT,
  getDownloadHistory,
  saveDownloadHistory,
} from './utils/storage.js';
import {
  DOWNLOAD_BUTTON_SELECTORS,
  findDownloadButtons,
  getInstagramPageKind,
  getPostDetails,
  getReelPoster as findReelPoster,
} from './utils/instagram-compat.js';

(() => {
  if (window.__turboBulkHistoryInstalled) return;
  window.__turboBulkHistoryInstalled = true;

  // Every download control the extension injects (see src/css/extension.css).
  const DOWNLOAD_BUTTONS = DOWNLOAD_BUTTON_SELECTORS.join(',');

  let panel;
  let historyGeneration = 0;
  let historyWriteQueue = Promise.resolve();
  let missingButtonsWarned = false;
  const activeDownloads = new Map();

  function constrainPanelPosition() {
    if (!panel?.isConnected) return;
    const margin = 8;
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(margin, innerWidth - panel.offsetWidth - margin);
    const maxTop = Math.max(margin, innerHeight - panel.offsetHeight - margin);
    const left = parseFloat(panel.style.left || `${rect.left}`);
    const top = parseFloat(panel.style.top || `${rect.top}`);
    panel.style.left = `${Math.min(maxLeft, Math.max(margin, left))}px`;
    panel.style.top = `${Math.min(maxTop, Math.max(margin, top))}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function savePanelPosition() {
    constrainPanelPosition();
    try {
      localStorage.setItem(
        'turboHistoryPosition',
        JSON.stringify({ left: panel.style.left, top: panel.style.top })
      );
    } catch (_) {
      /* Storage can be unavailable on restricted pages. */
    }
  }

  function showToast(message, type = 'success') {
    document.querySelector('#turbo-download-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'turbo-download-toast';
    toast.className = `tb-toast tb-toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toast.textContent = message;
    document.body.append(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function serializeHistoryWrite(operation) {
    const next = historyWriteQueue.then(operation);
    historyWriteQueue = next.catch(() => {});
    return next;
  }

  /**
   * Warn once when no download control can be found. If Instagram changes its
   * markup, the extension stops injecting buttons and the history panel would
   * silently stay empty - this makes that visible instead.
   */
  function checkForDownloadButtons() {
    if (missingButtonsWarned || findDownloadButtons().length) return;
    missingButtonsWarned = true;
    console.warn(
      `[TrendLoom] No download buttons found on this Instagram ${getInstagramPageKind(location.pathname)} page. Instagram may have changed the page markup.`
    );
  }

  function ensurePanel() {
    if (panel?.isConnected) return panel;

    panel = document.createElement('aside');
    panel.id = 'turbo-bulk-history';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Download History');
    panel.innerHTML = `
      <button class="tb-toggle" type="button" aria-expanded="false" aria-controls="tb-body" aria-label="Open download history" data-tooltip="Open download history · Drag to move">
        <svg class="tb-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M12 3v15m-6-6 6 6 6-6" /></svg>
        <span class="tb-title">Download History</span>
      </button>
      <section class="tb-body" id="tb-body" aria-hidden="true">
        <div class="tb-actions">
          <button class="tb-reset-position" type="button">Reset position</button>
          <button class="tb-clear" type="button" aria-label="Clear download history">Clear history</button>
        </div>
        <ol class="tb-list" role="list"></ol>
      </section>
    `;
    document.documentElement.append(panel);

    panel.querySelector('.tb-toggle').addEventListener('click', () => {
      const toggle = panel.querySelector('.tb-toggle');
      if (toggle.dataset.dragged === 'true') {
        delete toggle.dataset.dragged;
        return;
      }
      const body = panel.querySelector('.tb-body');
      const expanded = !panel.classList.contains('tb-expanded');
      body.setAttribute('aria-hidden', String(!expanded));
      panel.querySelector('.tb-toggle').setAttribute('aria-expanded', String(expanded));
      panel.classList.toggle('tb-expanded', expanded);
      panel
        .querySelector('.tb-toggle')
        .setAttribute('aria-label', expanded ? 'Close download history' : 'Open download history');
      panel.querySelector('.tb-toggle').dataset.tooltip = expanded
        ? 'Close download history · Drag to move'
        : 'Open download history · Drag to move';
      if (expanded) {
        renderHistory();
        checkForDownloadButtons();
        setTimeout(savePanelPosition, 350);
      }
    });
    panel.querySelector('.tb-clear').addEventListener('click', clearHistory);
    panel.querySelector('.tb-reset-position').addEventListener('click', resetPanelPosition);
    const toggle = panel.querySelector('.tb-toggle');
    let drag = null;
    let moved = false;
    toggle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
      };
      moved = false;
      toggle.setPointerCapture?.(event.pointerId);
    });
    toggle.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      panel.style.left = `${Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, drag.left + dx))}px`;
      panel.style.top = `${Math.max(8, Math.min(innerHeight - panel.offsetHeight - 8, drag.top + dy))}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    const finishDrag = () => {
      if (!drag) return;
      drag = null;
      if (moved) {
        const rect = panel.getBoundingClientRect();
        const maxLeft = Math.max(8, innerWidth - panel.offsetWidth - 8);
        const maxTop = Math.max(8, innerHeight - panel.offsetHeight - 8);
        let left = Math.max(8, Math.min(maxLeft, rect.left));
        let top = Math.max(8, Math.min(maxTop, rect.top));
        if (left - 8 < 24) left = 8;
        else if (maxLeft - left < 24) left = maxLeft;
        if (top - 8 < 24) top = 8;
        else if (maxTop - top < 24) top = maxTop;
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        savePanelPosition();
        toggle.dataset.dragged = 'true';
        setTimeout(() => delete toggle.dataset.dragged, 100);
      }
    };
    toggle.addEventListener('pointerup', finishDrag);
    toggle.addEventListener('pointercancel', finishDrag);
    try {
      const position = JSON.parse(localStorage.getItem('turboHistoryPosition') || 'null');
      if (
        position &&
        Number.isFinite(parseFloat(position.left)) &&
        Number.isFinite(parseFloat(position.top))
      ) {
        panel.style.left = `${Math.max(8, Math.min(innerWidth - 56, parseFloat(position.left)))}px`;
        panel.style.top = `${Math.max(8, Math.min(innerHeight - 56, parseFloat(position.top)))}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
    } catch (_) {
      /* Ignore invalid saved positions. */
    }
    toggle.addEventListener('keydown', (event) => {
      if (!event.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key))
        return;
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      const step = event.shiftKey ? 40 : 16;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      panel.style.left = `${rect.left + dx}px`;
      panel.style.top = `${rect.top + dy}px`;
      savePanelPosition();
    });
    return panel;
  }

  async function renderHistory() {
    if (!panel?.isConnected) return;

    const list = panel.querySelector('.tb-list');
    const rows = await getDownloadHistory();
    list.replaceChildren();

    if (!rows.length) {
      const empty = document.createElement('li');
      empty.className = 'tb-empty';
      empty.textContent =
        'No downloads yet. Use a TrendLoom download button on Instagram to add one here.';
      list.append(empty);
      return;
    }

    for (const row of rows.slice().reverse()) {
      const item = document.createElement('li');
      item.className = `tb-${row.status || 'unknown'}`;

      const link = document.createElement('a');
      link.href = row.url || location.href;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = row.label || 'Instagram download';

      const status = document.createElement('span');
      const statusLabels = {
        downloading: 'Downloading…',
        completed: 'Saved',
        unverified: 'Started · status unavailable',
        failed: `Failed${row.error ? `: ${row.error}` : ''}`,
        cancelled: 'Tracking stopped',
      };
      status.textContent = statusLabels[row.status] || 'Status unavailable';

      const actions = document.createElement('div');
      actions.className = 'tb-item-actions';
      if (row.status === 'downloading') {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'tb-cancel';
        cancel.textContent = 'Stop tracking';
        cancel.setAttribute('aria-label', `Stop tracking ${row.label || 'Instagram download'}`);
        cancel.addEventListener('click', () => stopTracking(row.id));
        actions.append(cancel);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tb-remove-item';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${row.label || 'Instagram download'} from history`);
      remove.addEventListener('click', () => removeHistoryItem(row.id));
      actions.append(remove);

      item.append(link, status, actions);
      list.append(item);
    }
  }

  async function updateHistoryItem(id, status, error = '') {
    await serializeHistoryWrite(async () => {
      const rows = await getDownloadHistory();
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return;

      rows[index] = { ...rows[index], status, error, updatedAt: Date.now() };
      await saveDownloadHistory(rows, DOWNLOAD_HISTORY_LIMIT);
    });
    renderHistory();
  }

  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Tracking stopped', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function waitForDownload(previousProgress, previousAlerts, signal) {
    const started = Date.now();
    let sawProgress = false;
    let idleSince = 0;

    while (Date.now() - started < 90000) {
      const progressBars = [...document.querySelectorAll('.downloadProgress')].filter(
        (progress) => !previousProgress.has(progress)
      );
      const visibleProgress = progressBars.filter(
        (progress) => getComputedStyle(progress).display !== 'none'
      );
      if (visibleProgress.length) {
        sawProgress = true;
        idleSince = 0;
        for (const progress of visibleProgress) {
          const message =
            progress.parentElement?.querySelector('.alert-message')?.textContent?.trim() || '';
          if (
            /could not|failed|temporarily preventing|permission not granted|request did not succeed/i.test(
              message
            )
          ) {
            throw new Error(message);
          }
        }
      } else if (sawProgress) {
        if (!idleSince) idleSince = Date.now();
        if (Date.now() - idleSince >= 500) return true;
      } else {
        const newError = [...document.querySelectorAll('.alert-message')].find((alert) => {
          const message = alert.textContent.trim();
          return (
            message &&
            message !== previousAlerts.get(alert) &&
            /could not|failed|temporarily preventing|permission not granted|request did not succeed/i.test(
              message
            )
          );
        });
        if (newError) throw new Error(newError.textContent.trim());
        if (Date.now() - started > 10000) return false;
      }

      await delay(150, signal);
    }
    if (!sawProgress) return false;
    throw new Error('Timed out waiting for Instagram to finish the download');
  }

  async function recordDownload(button) {
    const generation = historyGeneration;
    const details = getPostDetails(button);
    const previousProgress = new Set(document.querySelectorAll('.downloadProgress'));
    const previousAlerts = new Map(
      [...document.querySelectorAll('.alert-message')].map((alert) => [
        alert,
        alert.textContent.trim(),
      ])
    );
    const id =
      globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const wasSaved = await serializeHistoryWrite(async () => {
      if (generation !== historyGeneration) return false;
      const rows = await getDownloadHistory();
      rows.push({
        id,
        ...details,
        status: 'downloading',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await saveDownloadHistory(rows, DOWNLOAD_HISTORY_LIMIT);
      return true;
    });
    if (!wasSaved) return;
    const controller = new AbortController();
    activeDownloads.set(id, controller);
    renderHistory();

    try {
      const confirmed = await waitForDownload(previousProgress, previousAlerts, controller.signal);
      await updateHistoryItem(id, confirmed ? 'completed' : 'unverified');
    } catch (error) {
      if (controller.signal.aborted) await updateHistoryItem(id, 'cancelled');
      else await updateHistoryItem(id, 'failed', error.message || 'Download failed');
    } finally {
      activeDownloads.delete(id);
    }
  }

  function stopTracking(id) {
    activeDownloads.get(id)?.abort();
    showToast('Download tracking stopped. The browser download may continue.');
  }

  async function removeHistoryItem(id) {
    activeDownloads.get(id)?.abort();
    await serializeHistoryWrite(async () => {
      const rows = (await getDownloadHistory()).filter((row) => row.id !== id);
      await saveDownloadHistory(rows, DOWNLOAD_HISTORY_LIMIT);
    });
    await renderHistory();
  }

  function resetPanelPosition() {
    try {
      localStorage.removeItem('turboHistoryPosition');
    } catch (_) {
      /* Storage can be unavailable on restricted pages. */
    }
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '10px';
    panel.style.bottom = '10px';
    showToast('Download history position reset.');
  }

  async function clearHistory() {
    if (!window.confirm('Clear all download history?')) return;
    historyGeneration += 1;
    activeDownloads.forEach((controller) => controller.abort());
    activeDownloads.clear();
    await serializeHistoryWrite(() => saveDownloadHistory([]));
    await renderHistory();
  }

  function onDownloadClick(event) {
    const thumbnailButton = event.target.closest?.('.tb-reel-thumbnail-button');
    if (thumbnailButton) {
      event.preventDefault();
      event.stopPropagation();
      downloadReelThumbnail(thumbnailButton);
      return;
    }
    const button = event.target.closest?.(DOWNLOAD_BUTTONS);
    if (!button || panel?.contains(button)) return;
    recordDownload(button).catch((error) =>
      console.error('Could not save download history:', error)
    );
  }

  async function downloadReelThumbnail(button) {
    const posterUrl = findReelPoster(button);
    if (!posterUrl) {
      showToast('Reel thumbnail is unavailable.', 'error');
      return;
    }
    try {
      const response = await fetch(posterUrl);
      if (!response.ok) throw new Error(`Thumbnail request failed (${response.status})`);
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      const extension = new URL(posterUrl).pathname.match(/\.([a-z\d]+)$/i)?.[1] || 'jpg';
      anchor.download = `instagram-reel-thumbnail-${Date.now()}.${extension}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      showToast('Reel thumbnail downloaded.');
    } catch (error) {
      console.error('[TrendLoom] Could not download Reel thumbnail:', error);
      showToast('Could not download the Reel thumbnail. Please try again.', 'error');
    }
  }

  function addReelThumbnailButtons(root = document) {
    const buttons = [];
    if (root.matches?.('.reels-feed-download-button')) buttons.push(root);
    buttons.push(...(root.querySelectorAll?.('.reels-feed-download-button') || []));
    buttons.forEach((downloadButton) => {
      if (!findReelPoster(downloadButton)) return;
      if (downloadButton.parentElement?.querySelector('.tb-reel-thumbnail-button')) return;
      const thumbnailButton = document.createElement('button');
      thumbnailButton.type = 'button';
      thumbnailButton.className = 'tb-reel-thumbnail-button';
      thumbnailButton.setAttribute('aria-label', 'Download Reel thumbnail');
      thumbnailButton.dataset.tooltip = 'Download Reel thumbnail';
      thumbnailButton.title = 'Download Reel thumbnail';
      thumbnailButton.innerHTML =
        '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v14H4zM7 15l3-3 2 2 2-2 3 3M12 8v5m-2-2 2 2 2-2"/></svg>';
      downloadButton.insertAdjacentElement('afterend', thumbnailButton);
    });
  }

  const style = document.createElement('style');
  style.id = 'turbo-bulk-history-styles';
  style.textContent = `
    #turbo-bulk-history{position:fixed;z-index:2147483646;right:10px;bottom:10px;font:12px Arial,sans-serif;color:#171717;touch-action:none;user-select:none}
    #turbo-bulk-history button{border:0;border-radius:10px;padding:6px 9px;background:#fff;color:#171717;box-shadow:0 2px 12px #0003;cursor:pointer}
    #turbo-bulk-history button:focus{outline:2px solid #4381f4;outline-offset:2px}
    #turbo-bulk-history button:focus-visible,.tb-reel-thumbnail-button:focus-visible{outline:3px solid #fff;outline-offset:3px;box-shadow:0 0 0 5px #3478f6,0 5px 12px rgba(14,35,70,.25)}
    #turbo-bulk-history .tb-toggle{display:flex;align-items:center;justify-content:center;gap:6px;width:36px;height:36px;padding:0;border:1px solid rgba(255,255,255,.72);border-radius:50%;background:linear-gradient(145deg,rgba(72,190,230,.88),rgba(63,112,238,.9));-webkit-backdrop-filter:blur(12px) saturate(170%);backdrop-filter:blur(12px) saturate(170%);color:#fff;font-size:16px;font-weight:700;box-shadow:0 5px 12px rgba(14,35,70,.25),inset 0 1px 0 rgba(255,255,255,.62),inset 0 -1px 0 rgba(255,255,255,.16);transition:width .32s cubic-bezier(.2,.8,.2,1),border-radius .32s cubic-bezier(.2,.8,.2,1),transform .24s cubic-bezier(.2,.8,.2,1),box-shadow .24s ease}
    #turbo-bulk-history .tb-toggle:hover{transform:translateY(-1px);box-shadow:0 7px 15px rgba(14,35,70,.28),inset 0 1px 0 rgba(255,255,255,.72),inset 0 -1px 0 rgba(255,255,255,.2)}
    #turbo-bulk-history .tb-icon{position:absolute;left:50%;top:50%;display:block;flex:none;width:18px;height:18px;margin:0;overflow:visible;transform:translate(-50%,calc(-50% + 1px))}
    #turbo-bulk-history .tb-icon path{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    #turbo-bulk-history.tb-expanded .tb-icon{position:static;width:16px;height:16px;margin-left:1px;transform:translateY(1px)}
    #turbo-bulk-history .tb-title{display:inline-block;max-width:0;overflow:hidden;opacity:0;white-space:nowrap;font-size:13px;transition:max-width .32s cubic-bezier(.2,.8,.2,1),opacity .18s ease}
    #turbo-bulk-history.tb-expanded .tb-toggle{width:auto;max-width:calc(100vw - 20px);height:32px;padding:0 10px;border-radius:18px}
    #turbo-bulk-history.tb-expanded .tb-title{max-width:180px;opacity:1;transition-delay:.06s}
    #turbo-bulk-history .tb-toggle{touch-action:none;cursor:grab}
    #turbo-bulk-history .tb-toggle:active{cursor:grabbing}
    #turbo-bulk-history .tb-body{box-sizing:border-box;margin-top:0;width:min(320px,calc(100vw - 20px));max-height:0;overflow:hidden;visibility:hidden;opacity:0;transform:translateY(8px) scale(.98);transform-origin:top right;border-radius:12px;padding:0 10px;background:#fff;box-shadow:0 2px 16px #0003;pointer-events:none;transition:max-height .32s cubic-bezier(.2,.8,.2,1),opacity .2s ease,transform .32s cubic-bezier(.2,.8,.2,1),padding .32s ease,margin .32s ease,visibility 0s linear .32s}
    #turbo-bulk-history.tb-expanded .tb-body{margin-top:4px;max-height:38vh;overflow:auto;visibility:visible;opacity:1;transform:translateY(0) scale(1);padding:10px;pointer-events:auto;transition:max-height .32s cubic-bezier(.2,.8,.2,1),opacity .2s ease .04s,transform .32s cubic-bezier(.2,.8,.2,1),padding .32s ease,margin .32s ease,visibility 0s}
    #turbo-bulk-history .tb-actions{display:flex;gap:8px;flex-wrap:wrap}
    #turbo-bulk-history .tb-list .tb-item-actions{display:flex;gap:6px;margin-top:4px}
    #turbo-bulk-history .tb-list .tb-item-actions button,#turbo-bulk-history .tb-actions button{padding:4px 7px;font-size:11px}
    #turbo-bulk-history .tb-clear{font-size:12px}
    #turbo-bulk-history .tb-list{padding-left:16px;margin:7px 0 0}
    #turbo-bulk-history .tb-list li{padding:3px 0}
    #turbo-bulk-history .tb-list a{display:block;color:#3078d5;text-decoration:none}
    #turbo-bulk-history .tb-list a:hover{text-decoration:underline}
    #turbo-bulk-history .tb-list span{color:#555;font-size:12px}
    #turbo-bulk-history .tb-list .tb-failed span{color:#b3261e}
    #turbo-bulk-history .tb-list .tb-unverified span,#turbo-bulk-history .tb-list .tb-cancelled span{color:#805c16}
    #turbo-bulk-history .tb-empty{padding:14px 0;color:#666;list-style:none}
    .tb-reel-thumbnail-button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin:0 0 20px 4px;padding:0;border:1px solid rgba(255,255,255,.75);border-radius:50%;background:rgba(20,20,20,.65);color:#fff;font-size:17px;line-height:1;cursor:pointer}
    #turbo-bulk-history .tb-toggle{position:relative}
    #turbo-bulk-history .tb-toggle::after,.tb-reel-thumbnail-button::after{position:absolute;z-index:2147483647;right:0;bottom:calc(100% + 8px);width:max-content;max-width:min(240px,calc(100vw - 24px));padding:6px 9px;border:1px solid rgba(255,255,255,.2);border-radius:8px;background:rgba(20,24,34,.94);color:#fff;font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:normal;box-shadow:0 3px 10px #0003;opacity:0;visibility:hidden;transform:translateY(3px);transition:opacity .14s ease,transform .14s ease,visibility 0s linear .14s;pointer-events:none}
    #turbo-bulk-history .tb-toggle::after{content:attr(data-tooltip)}
    .tb-reel-thumbnail-button{position:relative}
    .tb-reel-thumbnail-button::after{content:attr(data-tooltip)}
    #turbo-bulk-history .tb-toggle:hover::after,#turbo-bulk-history .tb-toggle:focus-visible::after,.tb-reel-thumbnail-button:hover::after,.tb-reel-thumbnail-button:focus-visible::after{opacity:1;visibility:visible;transform:translateY(0);transition-delay:0s}
    .tb-toast{position:fixed;z-index:2147483647;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));max-width:min(340px,calc(100vw - 32px));padding:11px 15px;border:1px solid rgba(255,255,255,.25);border-radius:12px;background:rgba(24,32,45,.96);color:#fff;font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 5px 18px rgba(0,0,0,.24);animation:tb-toast-in .2s ease-out}
    .tb-toast-error{background:rgba(130,35,40,.97)}
    @keyframes tb-toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    .tb-reel-thumbnail-button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
    @media(max-width:520px){#turbo-bulk-history.tb-expanded .tb-toggle{font-size:12px}#turbo-bulk-history .tb-body{width:min(300px,calc(100vw - 16px));padding:8px}.tb-reel-thumbnail-button{width:44px;height:44px;margin-bottom:16px}.tb-reel-thumbnail-button svg{width:20px;height:20px}}
    @media(prefers-reduced-motion:reduce){#turbo-bulk-history .tb-toggle,#turbo-bulk-history .tb-title,#turbo-bulk-history .tb-body,#turbo-bulk-history .tb-toggle::after,.tb-reel-thumbnail-button::after{transition:none}#turbo-bulk-history .tb-toggle:hover{transform:none}.tb-toast{animation:none}}
    @supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){#turbo-bulk-history .tb-toggle{background:linear-gradient(145deg,#48bee6,#3f70ee)}}
  `;
  document.documentElement.append(style);
  ensurePanel();
  window.addEventListener('resize', () => {
    constrainPanelPosition();
    savePanelPosition();
  });
  document.addEventListener('click', onDownloadClick, true);
  addReelThumbnailButtons();
  const reelThumbnailObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'poster') {
        addReelThumbnailButtons();
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) addReelThumbnailButtons(node);
      }
    }
  });
  reelThumbnailObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['poster'],
  });
  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.turboDownloadHistory) renderHistory();
  });
  renderHistory();

  // Buttons are injected asynchronously by the extension, so check after a beat.
  setTimeout(checkForDownloadButtons, 5000);
})();
