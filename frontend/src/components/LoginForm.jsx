import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl } from '../api/client';
import { ROUTES } from '../routes/paths';

const REMEMBER_KEY = 'hmi32_remember_login';
const LEGACY_USERNAME_KEY = 'hmi32_remember_username';

const loadRememberedLogin = () => {
  try {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.username) {
        return {
          username: String(parsed.username),
          password: String(parsed.password || ''),
        };
      }
    }
  } catch {
    localStorage.removeItem(REMEMBER_KEY);
  }

  const legacyUsername = localStorage.getItem(LEGACY_USERNAME_KEY);
  if (legacyUsername) {
    return { username: legacyUsername, password: '' };
  }

  return null;
};

const saveRememberedLogin = (username, password) => {
  localStorage.setItem(
    REMEMBER_KEY,
    JSON.stringify({ username, password })
  );
  localStorage.removeItem(LEGACY_USERNAME_KEY);
};

const clearRememberedLogin = () => {
  localStorage.removeItem(REMEMBER_KEY);
  localStorage.removeItem(LEGACY_USERNAME_KEY);
};

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
    <circle cx="12" cy="8" r="4" />
    <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" strokeLinecap="round" />
  </svg>
);

const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
    <rect x="3" y="5" width="18" height="14" rx="1" />
    <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
    <rect x="5" y="11" width="14" height="10" rx="1" />
    <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
  </svg>
);

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="login-page__eye-icon">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="login-page__eye-icon">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-10-8-10-8a18.45 18.45 0 015.06-5.94" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 10 8 10 8a18.5 18.5 0 01-2.16 3.19" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14.12 14.12a3 3 0 01-4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LoginForm = ({ allowSignup = false, onSwitchToSignUp }) => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = loadRememberedLogin();
    if (saved) {
      setFormData(saved);
      setRememberMe(true);
    }
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (credentials) => {
      const response = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Login failed');
      }
      return data;
    },
    onSuccess: (data) => {
      if (!data.token) {
        setError('Login successful but no token received');
        return;
      }
      if (rememberMe) {
        saveRememberedLogin(formData.username, formData.password);
      } else {
        clearRememberedLogin();
      }
      login(data.token, data.user?.username || formData.username);
      navigate(ROUTES.MONITOR, { replace: true });
    },
    onError: (err) => {
      setError(err.message || 'Network error. Please try again.');
    },
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    loginMutation.mutate(formData);
  };

  return (
    <div className="login-page">
      <div className="login-page__bg" aria-hidden="true" />

      <div className="login-page__content">
        <div className="login-page__avatar">
          <UserIcon />
        </div>

        <h1 className="login-page__title">LOGIN</h1>

        <form className="login-page__form" onSubmit={handleSubmit}>
          <div className="login-page__field">
            <MailIcon />
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              placeholder="Email ID"
              value={formData.username}
              onChange={handleChange}
            />
          </div>

          <div className="login-page__field login-page__field--password">
            <LockIcon />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
            />
            <button
              type="button"
              className="login-page__eye"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          <div className="login-page__options">
            <label className="login-page__remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRememberMe(checked);
                  if (!checked) clearRememberedLogin();
                }}
              />
              <span className="login-page__checkbox" />
              Remember me
            </label>
          </div>

          {error && (
            <div className="login-page__error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="login-page__submit"
          >
            {loginMutation.isPending ? 'LOGGING IN...' : 'LOGIN'}
          </button>

          {allowSignup && (
            <p className="login-page__signup">
              New user?{' '}
              <button type="button" onClick={onSwitchToSignUp}>
                Create account
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default LoginForm;
