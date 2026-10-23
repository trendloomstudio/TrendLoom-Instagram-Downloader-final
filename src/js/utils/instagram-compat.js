export const DOWNLOAD_BUTTON_SELECTORS = [
  '.post-download-all-button',
  '.post-download-button',
  '.hover-download-button',
  '.account-download-button',
  '.reels-feed-download-button',
  '.story-download-button',
  '.story-download-all-button',
  '.bulk-download-link',
];

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

export function getInstagramPageKind(pathname) {
  const [first = '', second = ''] = pathname.split('/').filter(Boolean);
  if (first === 'p' || first === 'reel' || first === 'tv') return 'post';
  if (first === 'stories') return 'story';
  if (first === 'explore') return 'explore';
  if (first === 'reels') return second ? 'reels-feed' : 'reels';
  if (first && !RESERVED_ROUTES.has(first.toLowerCase())) return 'profile';
  return 'feed';
}

export function findDownloadButtons(root = document) {
  const selector = DOWNLOAD_BUTTON_SELECTORS.join(',');
  return [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
}

export function getPostDetails(button, pageUrl = location.href) {
  const article = button.closest('article');
  const postLink = article?.querySelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
  const userLink = article?.querySelector('a[href^="/"]');
  const firstPathSegment = new URL(pageUrl).pathname.split('/').filter(Boolean)[0];
  const username =
    userLink?.getAttribute('href')?.split('/').filter(Boolean)[0] ||
    (firstPathSegment && !RESERVED_ROUTES.has(firstPathSegment.toLowerCase())
      ? firstPathSegment
      : '');

  return {
    label: username ? `@${username}` : 'Instagram download',
    url: postLink ? new URL(postLink.getAttribute('href'), pageUrl).href : pageUrl,
  };
}

export function getReelPoster(downloadButton) {
  let container = downloadButton.parentElement;
  for (let depth = 0; container && depth < 10; depth += 1, container = container.parentElement) {
    const video = container.querySelector('video');
    const poster = video?.poster || video?.getAttribute('poster');
    if (poster) return poster;
  }
  return '';
}
