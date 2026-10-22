/**
 * Tests for the download history panel
 */

const HISTORY_KEY = 'turboDownloadHistory';

let storage;

beforeAll(async () => {
  jest.useFakeTimers();
  await import('../js/bulk-history.js');
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
});

function postMarkup() {
  document.body.innerHTML = `
    <article>
      <a href="/trendloom"><span>trendloom</span></a>
      <a href="/p/ABC123/"><img alt="post" /></a>
      <div class="post-download-all-button"></div>
    </article>
  `;
  return document.querySelector('.post-download-all-button');
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

  it('ignores clicks that happen inside the panel itself', async () => {
    postMarkup();

    document.querySelector('.tb-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(0);

    expect(history()).toHaveLength(0);
  });

  it('clears the stored history on request', async () => {
    const button = postMarkup();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(0);
    expect(history()).toHaveLength(1);

    document.querySelector('.tb-clear').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(0);

    expect(history()).toHaveLength(0);
  });
});
