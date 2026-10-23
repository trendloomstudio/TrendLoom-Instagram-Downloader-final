import {
  DOWNLOAD_HISTORY_LIMIT,
  getDownloadHistory,
  saveDownloadHistory,
} from './utils/storage.js';

(() => {
  if (window.__turboBulkHistoryInstalled) return;
  window.__turboBulkHistoryInstalled = true;

  // Every download control the extension injects (see src/css/extension.css).
  const DOWNLOAD_BUTTONS = [
    '.post-download-all-button',
    '.post-download-button',
    '.hover-download-button',
    '.account-download-button',
    '.reels-feed-download-button',
    '.story-download-button',
    '.story-download-all-button',
    '.bulk-download-link',
  ].join(',');

  // Instagram routes that are not user handles.
  const RESERVED_ROUTES = new Set([
    'p',
    'reel',
    'reels',
    'tv',
    'stories',
    'explore',
    'direct',
    'accounts',
    'about',
    'settings',
    'search',
  ]);

  let panel;
  let historyGeneration = 0;
  let historyWriteQueue = Promise.resolve();
  let missingButtonsWarned = false;

  function serializeHistoryWrite(operation) {
    const next = historyWriteQueue.then(operation);
    historyWriteQueue = next.catch(() => {});
    return next;
  }

  function usernameFromPath(pathname) {
    const segment = pathname.split('/').filter(Boolean)[0];
    if (!segment || RESERVED_ROUTES.has(segment.toLowerCase())) return '';
    return segment;
  }

  function postDetails(button) {
    const article = button.closest('article');
    const postLink = article?.querySelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
    const userLink = article?.querySelector('a[href^="/"]');
    const username =
      userLink?.getAttribute('href')?.split('/').filter(Boolean)[0] ||
      usernameFromPath(location.pathname);

    return {
      label: username ? `@${username}` : 'Instagram download',
      url: postLink ? new URL(postLink.getAttribute('href'), location.origin).href : location.href,
    };
  }

  /**
   * Warn once when no download control can be found. If Instagram changes its
   * markup, the extension stops injecting buttons and the history panel would
   * silently stay empty - this makes that visible instead.
   */
  function checkForDownloadButtons() {
    if (missingButtonsWarned || document.querySelector(DOWNLOAD_BUTTONS)) return;
    missingButtonsWarned = true;
    console.warn(
      '[TrendLoom] No download buttons found on this page. The download history panel will stay empty until the extension is updated for the current Instagram markup.'
    );
  }

  function ensurePanel() {
    if (panel?.isConnected) return panel;

    panel = document.createElement('aside');
    panel.id = 'turbo-bulk-history';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Download History');
    panel.innerHTML = `
      <button class="tb-toggle" type="button" aria-expanded="false" aria-controls="tb-body" aria-label="Open download history">
        <svg class="tb-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M12 3v15m-6-6 6 6 6-6" /></svg>
        <span class="tb-title">Download History</span>
      </button>
      <section class="tb-body" id="tb-body" aria-hidden="true">
        <div class="tb-actions">
          <button class="tb-clear" type="button" aria-label="Clear download history">Clear history</button>
        </div>
        <ol class="tb-list" role="list"></ol>
      </section>
    `;
    document.documentElement.append(panel);

    panel.querySelector('.tb-toggle').addEventListener('click', () => {
      const body = panel.querySelector('.tb-body');
      const expanded = !panel.classList.contains('tb-expanded');
      body.setAttribute('aria-hidden', String(!expanded));
      panel.querySelector('.tb-toggle').setAttribute('aria-expanded', String(expanded));
      panel.classList.toggle('tb-expanded', expanded);
      panel
        .querySelector('.tb-toggle')
        .setAttribute('aria-label', expanded ? 'Close download history' : 'Open download history');
      if (expanded) {
        renderHistory();
        checkForDownloadButtons();
      }
    });
    panel.querySelector('.tb-clear').addEventListener('click', clearHistory);
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
      toggle.setPointerCapture(event.pointerId);
    });
    toggle.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      panel.style.left = `${Math.max(0, Math.min(innerWidth - panel.offsetWidth, drag.left + dx))}px`;
      panel.style.top = `${Math.max(0, Math.min(innerHeight - panel.offsetHeight, drag.top + dy))}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    const finishDrag = () => {
      if (!drag) return;
      drag = null;
      if (moved) {
        try {
          localStorage.setItem(
            'turboHistoryPosition',
            JSON.stringify({ left: panel.style.left, top: panel.style.top })
          );
        } catch (_) {
          /* Storage can be unavailable on restricted pages. */
        }
        toggle.dataset.dragged = 'true';
        setTimeout(() => delete toggle.dataset.dragged, 0);
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
        panel.style.left = `${Math.max(0, Math.min(innerWidth - 56, parseFloat(position.left)))}px`;
        panel.style.top = `${Math.max(0, Math.min(innerHeight - 56, parseFloat(position.top)))}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
    } catch (_) {
      /* Ignore invalid saved positions. */
    }
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
      status.textContent = `${row.status || 'saved'}${row.error ? `: ${row.error}` : ''}`;

      item.append(link, status);
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

  async function waitForDownload() {
    const started = Date.now();
    while (Date.now() - started < 90000) {
      const progress = document.querySelector('.downloadProgress');
      const message = document.querySelector('.alert-message')?.textContent?.trim() || '';

      if (progress && getComputedStyle(progress).display !== 'none') {
        if (/could not|failed|temporarily preventing/i.test(message)) {
          throw new Error(message);
        }
      } else if (Date.now() - started > 1500) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Timed out waiting for Instagram to finish the download');
  }

  async function recordDownload(button) {
    const generation = historyGeneration;
    const details = postDetails(button);
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
    renderHistory();

    try {
      await waitForDownload();
      await updateHistoryItem(id, 'completed');
    } catch (error) {
      await updateHistoryItem(id, 'failed', error.message || 'Download failed');
    }
  }

  async function clearHistory() {
    historyGeneration += 1;
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

  function getReelPoster(downloadButton) {
    let container = downloadButton.parentElement;
    for (let depth = 0; container && depth < 10; depth += 1, container = container.parentElement) {
      const video = container.querySelector('video');
      if (video?.poster) return video.poster;
    }
    return '';
  }

  async function downloadReelThumbnail(button) {
    const posterUrl = getReelPoster(button);
    if (!posterUrl) {
      console.warn('[TrendLoom] This Reel does not expose a downloadable thumbnail.');
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
    } catch (error) {
      console.error('[TrendLoom] Could not download Reel thumbnail:', error);
    }
  }

  function addReelThumbnailButtons(root = document) {
    root.querySelectorAll?.('.reels-feed-download-button').forEach((downloadButton) => {
      if (downloadButton.parentElement?.querySelector('.tb-reel-thumbnail-button')) return;
      const thumbnailButton = document.createElement('button');
      thumbnailButton.type = 'button';
      thumbnailButton.className = 'tb-reel-thumbnail-button';
      thumbnailButton.setAttribute('aria-label', 'Download Reel thumbnail');
      thumbnailButton.title = 'Download Reel thumbnail';
      thumbnailButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v14H4zM7 15l3-3 2 2 2-2 3 3M12 8v5m-2-2 2 2 2-2"/></svg>';
      downloadButton.insertAdjacentElement('afterend', thumbnailButton);
    });
  }

  const style = document.createElement('style');
  style.id = 'turbo-bulk-history-styles';
  style.textContent = `
    #turbo-bulk-history{position:fixed;z-index:2147483646;right:10px;bottom:10px;font:12px Arial,sans-serif;color:#171717;touch-action:none;user-select:none}
    #turbo-bulk-history button{border:0;border-radius:10px;padding:6px 9px;background:#fff;color:#171717;box-shadow:0 2px 12px #0003;cursor:pointer}
    #turbo-bulk-history button:focus{outline:2px solid #4381f4;outline-offset:2px}
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
    #turbo-bulk-history .tb-clear{font-size:12px}
    #turbo-bulk-history .tb-list{padding-left:16px;margin:7px 0 0}
    #turbo-bulk-history .tb-list li{padding:3px 0}
    #turbo-bulk-history .tb-list a{display:block;color:#3078d5;text-decoration:none}
    #turbo-bulk-history .tb-list a:hover{text-decoration:underline}
    #turbo-bulk-history .tb-list span{color:#555;font-size:12px}
    #turbo-bulk-history .tb-list .tb-failed span{color:#b3261e}
    #turbo-bulk-history .tb-empty{padding:14px 0;color:#666;list-style:none}
    .tb-reel-thumbnail-button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin:0 0 20px 4px;padding:0;border:1px solid rgba(255,255,255,.75);border-radius:50%;background:rgba(20,20,20,.65);color:#fff;font-size:17px;line-height:1;cursor:pointer}
    .tb-reel-thumbnail-button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
    @media(max-width:520px){#turbo-bulk-history.tb-expanded .tb-toggle{font-size:12px}#turbo-bulk-history .tb-body{width:min(300px,calc(100vw - 16px));padding:8px}}
    @media(prefers-reduced-motion:reduce){#turbo-bulk-history .tb-toggle,#turbo-bulk-history .tb-title,#turbo-bulk-history .tb-body{transition:none}#turbo-bulk-history .tb-toggle:hover{transform:none}}
    @supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){#turbo-bulk-history .tb-toggle{background:linear-gradient(145deg,#48bee6,#3f70ee)}}
  `;
  document.documentElement.append(style);
  ensurePanel();
  document.addEventListener('click', onDownloadClick, true);
  addReelThumbnailButtons();
  const reelThumbnailObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) addReelThumbnailButtons(node);
      }
    }
  });
  reelThumbnailObserver.observe(document.documentElement, { childList: true, subtree: true });
  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.turboDownloadHistory) renderHistory();
  });
  renderHistory();

  // Buttons are injected asynchronously by the extension, so check after a beat.
  setTimeout(checkForDownloadButtons, 5000);
})();
