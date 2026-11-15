export function openExternal(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  if (window.api && typeof window.api.openExternal === 'function') {
    window.api.openExternal(url);
    return true;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}