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

/** Returns true if JWT is missing, malformed, or past exp. */
export function isAuthTokenExpired(token) {
  if (!token || typeof token !== 'string') return true;
  const parts = token.split('.');
  if (parts.length !== 3) return true;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}
