const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
export interface InvitationContinuation { readonly token: string }

export function clearInvitationContinuation() {
  const url = new URL(window.location.href);
  url.searchParams.delete('token');
  const fragment = new URLSearchParams(url.hash.slice(1));
  fragment.delete('token');
  url.hash = fragment.toString();
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

export function readInvitationContinuation(): InvitationContinuation | null {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const token = url.searchParams.get('token') ?? fragment.get('token') ?? '';
  return tokenPattern.test(token) ? { token } : null;
}
