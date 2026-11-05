import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { apiUrl } from '../api/client';
import {
  readStoredAuth,
  writeStoredAuth,
  clearStoredAuth,
  isAuthTokenExpired,
  hasUsableStoredSession,
} from '../utils/authToken';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

function readInitialSession() {
  const { token, username } = readStoredAuth();
  if (!token || isAuthTokenExpired(token)) {
    if (token) clearStoredAuth();
    return { token: '', username: '', isAuthenticated: false };
  }
  return { token, username, isAuthenticated: true };
}

export const AuthProvider = ({ children }) => {
  // Sync restore — first paint already knows login state (no refresh → login flash).
  const [session] = useState(readInitialSession);
  const [isAuthenticated, setIsAuthenticated] = useState(session.isAuthenticated);
  const [token, setToken] = useState(session.token);
  const [username, setUsername] = useState(session.username);
  const [loading] = useState(false);

  const logout = useCallback(() => {
    clearStoredAuth();
    setToken('');
    setUsername('');
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const softVerify = async () => {
      if (!hasUsableStoredSession()) {
        return;
      }

      const { token: storedToken, username: storedUsername } = readStoredAuth();
      if (!cancelled) {
        setToken(storedToken);
        setUsername(storedUsername);
        setIsAuthenticated(true);
      }

      try {
        const response = await fetch(apiUrl('/api/auth/me'), {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (response.ok && data.success) {
          const name = data.user?.username || storedUsername || '';
          setUsername(name);
          writeStoredAuth(storedToken, name);
          return;
        }

        // Server rejected token (wrong secret, revoked, etc.) — clear stale session.
        if (response.status === 401 || response.status === 403) {
          clearStoredAuth();
          if (!cancelled) {
            setToken('');
            setUsername('');
            setIsAuthenticated(false);
          }
          return;
        }

        // Network / 5xx — keep local session until JWT exp or logout.
      } catch {
        /* keep session */
      }
    };

    softVerify();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((authToken, user = '') => {
    writeStoredAuth(authToken, user);
    setToken(authToken);
    setUsername(user);
    setIsAuthenticated(true);
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated,
      token,
      username,
      loading,
      login,
      logout,
    }),
    [isAuthenticated, token, username, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
