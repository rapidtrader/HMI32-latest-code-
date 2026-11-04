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

const applyStoredSession = (storedToken, storedUsername) => ({
  token: storedToken,
  username: storedUsername,
  isAuthenticated: true,
});

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
    const verifyStoredSession = async () => {
      const { token: storedToken, username: storedUsername } = readStoredAuth();

      if (!storedToken) {
        setLoading(false);
        return;
      }

      if (isAuthTokenExpired(storedToken)) {
        logout();
        setLoading(false);
        return;
      }

      const session = applyStoredSession(storedToken, storedUsername);
      setToken(session.token);
      setUsername(session.username);
      setIsAuthenticated(true);

      try {
        const response = await fetch(apiUrl('/api/auth/me'), {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        const data = await response.json().catch(() => ({}));

        if (response.status === 401 || response.status === 403) {
          logout();
          return;
        }

        if (response.ok && data.success) {
          setUsername(data.user?.username || storedUsername || '');
        }
      } catch {
        // Keep session on network errors — refresh must not log out if API is briefly unreachable.
      } finally {
        setLoading(false);
      }
    };

    verifyStoredSession();
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
