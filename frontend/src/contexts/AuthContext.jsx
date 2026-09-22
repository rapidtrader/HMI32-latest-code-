import { createContext, useContext, useState, useEffect } from 'react';
import { apiUrl } from '../api/client';

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

  useEffect(() => {
    const verifyStoredSession = async () => {
      const storedToken = localStorage.getItem('hmi32_authToken');
      const storedUsername = localStorage.getItem('hmi32_username');

      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(apiUrl('/api/auth/me'), {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success) {
          setToken(storedToken);
          setUsername(data.user?.username || storedUsername || '');
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('hmi32_authToken');
          localStorage.removeItem('hmi32_username');
        }
      } catch {
        localStorage.removeItem('hmi32_authToken');
        localStorage.removeItem('hmi32_username');
      } finally {
        setLoading(false);
      }
    };

    verifyStoredSession();
  }, []);

  const login = (authToken, user = '') => {
    localStorage.setItem('hmi32_authToken', authToken);
    localStorage.setItem('hmi32_username', user);
    setToken(authToken);
    setUsername(user);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('hmi32_authToken');
    localStorage.removeItem('hmi32_username');
    setToken('');
    setUsername('');
    setIsAuthenticated(false);
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
