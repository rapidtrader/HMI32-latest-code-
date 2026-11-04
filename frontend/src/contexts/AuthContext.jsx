import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../api/client';
import {
  AUTH_TOKEN_KEY,
  AUTH_USERNAME_KEY,
  readStoredAuth,
  clearStoredAuth,
  isAuthTokenExpired,
} from '../utils/authToken';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearStoredAuth();
    setToken('');
    setUsername('');
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const verifyStoredSession = async () => {
      const { token: storedToken, username: storedUsername } = readStoredAuth();

      if (!storedToken) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Only clear when JWT is clearly past exp (padding-safe decode).
      if (isAuthTokenExpired(storedToken)) {
        logout();
        if (!cancelled) setLoading(false);
        return;
      }

      // Keep user logged in through refresh immediately.
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

        // Only hard logout when server rejects the token.
        if (response.status === 401 || response.status === 403) {
          logout();
          return;
        }

        if (response.ok && data.success) {
          setUsername(data.user?.username || storedUsername || '');
        }
      } catch {
        // Network blip: keep local session.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    verifyStoredSession();
    return () => {
      cancelled = true;
    };
  }, [logout]);

  const login = (authToken, user = '') => {
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    localStorage.setItem(AUTH_USERNAME_KEY, user);
    setToken(authToken);
    setUsername(user);
    setIsAuthenticated(true);
  };

  const value = {
    isAuthenticated,
    token,
    username,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
