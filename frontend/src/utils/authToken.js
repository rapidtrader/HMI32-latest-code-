export const AUTH_TOKEN_KEY = 'hmi32_authToken';
export const AUTH_USERNAME_KEY = 'hmi32_username';

function storageGet(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readStoredAuth() {
  return {
    token: storageGet(AUTH_TOKEN_KEY),
    username: storageGet(AUTH_USERNAME_KEY),
  };
}

export function writeStoredAuth(token, username = '') {
  storageSet(AUTH_TOKEN_KEY, token || '');
  storageSet(AUTH_USERNAME_KEY, username || '');
}

export function clearStoredAuth() {
  storageRemove(AUTH_TOKEN_KEY);
  storageRemove(AUTH_USERNAME_KEY);
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

/** true only when exp is present and clearly in the past */
export function isAuthTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || payload.exp == null) return false;
  // 30s clock skew tolerance
  return Date.now() >= Number(payload.exp) * 1000 + 30_000;
}

export function hasUsableStoredSession() {
  const { token } = readStoredAuth();
  return Boolean(token) && !isAuthTokenExpired(token);
}
