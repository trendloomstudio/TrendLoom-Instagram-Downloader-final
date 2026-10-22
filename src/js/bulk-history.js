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
      <section class="tb-body" id="tb-body" hidden>
        <div class="tb-actions">
          <button class="tb-clear" type="button" aria-label="Clear download history">Clear history</button>
        </div>
        <ol class="tb-list" role="list"></ol>
      </section>
    `;
    document.documentElement.append(panel);

    panel.querySelector('.tb-toggle').addEventListener('click', () => {
      const body = panel.querySelector('.tb-body');
      const expanded = body.hidden;
      body.hidden = !expanded;
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
    const button = event.target.closest?.(DOWNLOAD_BUTTONS);
    if (!button || panel?.contains(button)) return;
    recordDownload(button).catch((error) =>
      console.error('Could not save download history:', error)
    );
  }

  const style = document.createElement('style');
  style.id = 'turbo-bulk-history-styles';
  style.textContent = `
    #turbo-bulk-history{position:fixed;z-index:2147483646;right:10px;bottom:10px;font:12px Arial,sans-serif;color:#171717;touch-action:none;user-select:none}
    #turbo-bulk-history button{border:0;border-radius:10px;padding:6px 9px;background:#fff;color:#171717;box-shadow:0 2px 12px #0003;cursor:pointer}
    #turbo-bulk-history button:focus{outline:2px solid #4381f4;outline-offset:2px}
    #turbo-bulk-history .tb-toggle{display:flex;align-items:center;justify-content:center;gap:6px;width:36px;height:36px;padding:0;border:2px solid #4381f4;border-radius:50%;background:linear-gradient(135deg,#18b8a5 0%,#4381f4 100%);color:#fff;font-size:16px;font-weight:700;box-shadow:0 3px 7px rgba(20,45,85,.2);transition:width .18s ease,border-radius .18s ease}
    #turbo-bulk-history .tb-icon{display:block;width:17px;height:17px;overflow:visible;transform:translateY(1px)}
    #turbo-bulk-history .tb-icon path{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    #turbo-bulk-history .tb-title{display:none;white-space:nowrap;font-size:13px}
    #turbo-bulk-history.tb-expanded .tb-toggle{width:auto;max-width:calc(100vw - 20px);height:32px;padding:0 10px;border-radius:18px}
    #turbo-bulk-history.tb-expanded .tb-title{display:inline}
    #turbo-bulk-history .tb-toggle{touch-action:none;cursor:grab}
    #turbo-bulk-history .tb-toggle:active{cursor:grabbing}
    #turbo-bulk-history .tb-body{box-sizing:border-box;margin-top:4px;width:min(320px,calc(100vw - 20px));max-height:38vh;overflow:auto;border-radius:12px;padding:10px;background:#fff;box-shadow:0 2px 16px #0003}
    #turbo-bulk-history .tb-actions{display:flex;gap:8px;flex-wrap:wrap}
    #turbo-bulk-history .tb-clear{font-size:12px}
    #turbo-bulk-history .tb-list{padding-left:16px;margin:7px 0 0}
    #turbo-bulk-history .tb-list li{padding:3px 0}
    #turbo-bulk-history .tb-list a{display:block;color:#3078d5;text-decoration:none}
    #turbo-bulk-history .tb-list a:hover{text-decoration:underline}
    #turbo-bulk-history .tb-list span{color:#555;font-size:12px}
    #turbo-bulk-history .tb-list .tb-failed span{color:#b3261e}
    #turbo-bulk-history .tb-empty{padding:14px 0;color:#666;list-style:none}
    @media(max-width:520px){#turbo-bulk-history.tb-expanded .tb-toggle{font-size:12px}#turbo-bulk-history .tb-body{width:min(300px,calc(100vw - 16px));padding:8px}}
  `;
  document.documentElement.append(style);
  ensurePanel();
  document.addEventListener('click', onDownloadClick, true);
  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.turboDownloadHistory) renderHistory();
  });
  renderHistory();

  // Buttons are injected asynchronously by the extension, so check after a beat.
  setTimeout(checkForDownloadButtons, 5000);
})();
