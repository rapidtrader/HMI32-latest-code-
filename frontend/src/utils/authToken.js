export const AUTH_TOKEN_KEY = 'hmi32_authToken';
export const AUTH_USERNAME_KEY = 'hmi32_username';

export function readStoredAuth() {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    const username = localStorage.getItem(AUTH_USERNAME_KEY) || '';
    return { token, username };
  } catch {
    return { token: '', username: '' };
  }
}

export function clearStoredAuth() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USERNAME_KEY);
  } catch {
    /* ignore */
  }
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

/**
 * true = definitely expired
 * false = still valid OR unknown (do not force logout on parse failure)
 */
export function isAuthTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || payload.exp == null) return false;
  return Date.now() >= Number(payload.exp) * 1000;
}
