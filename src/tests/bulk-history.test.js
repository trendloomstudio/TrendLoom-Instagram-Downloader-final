/**
 * Tests for the download history panel
 */

const HISTORY_KEY = 'turboDownloadHistory';

let storage;
let panelElement;

beforeAll(async () => {
  jest.useFakeTimers();
  await import('../js/bulk-history.js');
  panelElement = document.getElementById('turbo-bulk-history');
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  storage = {};
  chrome.storage.local.get.mockImplementation((key) =>
    Promise.resolve(key in storage ? { [key]: storage[key] } : {})
  );
  chrome.storage.local.set.mockImplementation((items) => {
    Object.assign(storage, items);
    return Promise.resolve();
  });
  document.body.innerHTML = '';
  document.body.append(panelElement);
  panelElement.classList.remove('tb-expanded');
  panelElement.querySelector('.tb-toggle').setAttribute('aria-expanded', 'false');
  panelElement.querySelector('.tb-toggle').setAttribute('aria-label', 'Open download history');
  panelElement.querySelector('.tb-body').setAttribute('aria-hidden', 'true');
});

function postMarkup() {
  const markup = document.createElement('div');
  markup.innerHTML = `
    <article>
      <a href="/trendloom"><span>trendloom</span></a>
      <a href="/p/ABC123/"><img alt="post" /></a>
      <div class="post-download-all-button"></div>
    </article>
  `;
  document.body.append(markup);
  return markup.querySelector('.post-download-all-button');
}

function history() {
  return storage[HISTORY_KEY] || [];
}

describe('Download history panel', () => {
  it('renders a history panel without any checkbox controls', () => {
    const panel = document.getElementById('turbo-bulk-history');

    expect(panel).not.toBeNull();
    expect(panel.querySelector('.tb-toggle').textContent).toContain('Download History');
    expect(panel.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(panel.querySelector('.tb-reset-position').textContent).toBe('Reset position');
  });

  it('warns when no download button can be found on the page', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await jest.advanceTimersByTimeAsync(5000);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No download buttons found'));
    warn.mockRestore();
  });

  it('records a download when a TrendLoom download button is clicked', async () => {
    const button = postMarkup();

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(0);

    expect(history()).toHaveLength(1);
    expect(history()[0]).toMatchObject({
      label: '@trendloom',
      status: 'downloading',
    });
    expect(history()[0].url).toContain('/p/ABC123/');
  });

  it('does not report failure when Instagram exposes no progress indicator', async () => {
    postMarkup().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(10100);

    expect(history()[0].status).toBe('unverified');
    expect(document.querySelector('.tb-list span').textContent).toMatch(/status unavailable/);
  });

  it('marks a download complete after its newly created progress element ends', async () => {
    const button = postMarkup();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    setTimeout(() => {
      const progress = document.createElement('div');
      progress.className = 'downloadProgress';
      progress.style.display = 'block';
      button.parentElement.append(progress);
      setTimeout(() => progress.remove(), 500);
    }, 300);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(2000);
    expect(history()[0].status).toBe('completed');
  });

  it('ignores clicks that happen inside the panel itself', async () => {
    document.querySelector('.tb-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(0);

    expect(history()).toHaveLength(0);
  });

  it('clears the stored history on request', async () => {
    const button = postMarkup();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(0);
    expect(history()).toHaveLength(1);

    jest.spyOn(window, 'confirm').mockReturnValue(true);
    document.querySelector('.tb-clear').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(0);

    expect(history()).toHaveLength(0);
    window.confirm.mockRestore();
  });

  it('keeps history when clear confirmation is declined', async () => {
    storage[HISTORY_KEY] = [{ id: 'one', label: '@one', url: '/', status: 'completed' }];
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    document.querySelector('.tb-clear').click();
    await jest.advanceTimersByTimeAsync(0);
    expect(history()).toHaveLength(1);
    window.confirm.mockRestore();
  });

  it('stops monitoring without claiming the browser transfer was cancelled', async () => {
    postMarkup().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(0);
    document.querySelector('.tb-cancel').click();
    await jest.advanceTimersByTimeAsync(0);
    expect(history()[0].status).toBe('cancelled');
    expect(document.querySelector('.tb-toast').textContent).toMatch(
      /browser download may continue/
    );
  });

  it('resets the panel position', () => {
    localStorage.setItem('turboHistoryPosition', JSON.stringify({ left: '100px', top: '100px' }));
    document.querySelector('.tb-reset-position').click();
    expect(localStorage.getItem('turboHistoryPosition')).toBeNull();
    expect(panelElement.style.left).toBe('');
    expect(panelElement.style.right).toBe('10px');
  });

  it('exposes keyboard-friendly history controls and supports keyboard repositioning', () => {
    const toggle = document.querySelector('.tb-toggle');
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.tb-body').getAttribute('aria-hidden')).toBe('false');

    toggle.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        altKey: true,
        bubbles: true,
      })
    );
    expect(document.getElementById('turbo-bulk-history').style.left).toBe('16px');
  });

  it('does not open the panel when a pointer drag ends with a click', () => {
    const toggle = document.querySelector('.tb-toggle');
    const pointer = (type, properties = {}) => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, properties);
      return event;
    };
    toggle.dispatchEvent(
      pointer('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    );
    toggle.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 30, clientY: 30 }));
    toggle.dispatchEvent(pointer('pointerup', { pointerId: 1 }));
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not show the Reel thumbnail control when there is no usable poster', async () => {
    const downloadButton = document.createElement('div');
    downloadButton.className = 'reels-feed-download-button';
    document.body.append(downloadButton);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.tb-reel-thumbnail-button')).toBeNull();
  });

  it('labels the Reel thumbnail button and reveals it when a poster becomes available', async () => {
    const post = document.createElement('div');
    post.innerHTML =
      '<video poster="https://cdn.example/poster.jpg"></video><span class="reels-feed-download-button"></span>';
    document.body.append(post);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(0);
    const button = post.querySelector('.tb-reel-thumbnail-button');
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-label')).toBe('Download Reel thumbnail');
    expect(button.title).toBe('Download Reel thumbnail');
  });

  it('provides mobile-sized thumbnail controls and reduced-motion styling', () => {
    const styles = document.getElementById('turbo-bulk-history-styles').textContent;
    expect(styles).toContain('@media(max-width:520px)');
    expect(styles).toContain('.tb-reel-thumbnail-button{width:44px;height:44px');
    expect(styles).toContain('@media(prefers-reduced-motion:reduce)');
    expect(styles).toContain('.tb-toggle:focus-visible');
  });
});
