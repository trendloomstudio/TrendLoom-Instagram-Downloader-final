import {
  DOWNLOAD_BUTTON_SELECTORS,
  findDownloadButtons,
  getInstagramPageKind,
  getPostDetails,
  getReelPoster,
} from '../js/utils/instagram-compat.js';

describe('Instagram compatibility helpers', () => {
  it.each([
    ['/p/ABC123/', 'post'],
    ['/reel/ABC123/', 'post'],
    ['/stories/example/', 'story'],
    ['/explore/tags/travel/', 'explore'],
    ['/reels/', 'reels'],
    ['/reels/ABC123/', 'reels-feed'],
    ['/example/', 'profile'],
    ['/', 'feed'],
  ])('classifies %s as %s', (pathname, expected) => {
    expect(getInstagramPageKind(pathname)).toBe(expected);
  });

  it('finds known download controls including a root node', () => {
    const root = document.createElement('div');
    root.className = 'reels-feed-download-button';
    const nested = document.createElement('div');
    nested.className = 'post-download-button';
    root.append(nested);

    expect(findDownloadButtons(root)).toEqual([root, nested]);
    expect(DOWNLOAD_BUTTON_SELECTORS).toContain('.reels-feed-download-button');
  });

  it('extracts a post URL and username from Instagram markup', () => {
    const article = document.createElement('article');
    article.innerHTML = '<a href="/creator/">Creator</a><a href="/reel/XYZ/">Reel</a>';
    const button = document.createElement('button');
    article.append(button);

    expect(getPostDetails(button, 'https://www.instagram.com/')).toEqual({
      label: '@creator',
      url: 'https://www.instagram.com/reel/XYZ/',
    });
  });

  it('uses the available Reel poster URL', () => {
    const root = document.createElement('div');
    root.innerHTML = '<video poster="https://cdn.example/reel.jpg"></video><button></button>';
    expect(getReelPoster(root.querySelector('button'))).toBe('https://cdn.example/reel.jpg');
  });
});
