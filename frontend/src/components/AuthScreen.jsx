import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '../api/client';
import LoginForm from './LoginForm';
import SignUpForm from './SignUpForm';
import { AUTH_ROUTES } from '../routes/paths';

/** /auth/login */
export const LoginPage = () => {
  const navigate = useNavigate();
  const { data: allowSignup = false, isLoading } = useQuery({
    queryKey: ['auth', 'signup-available'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/auth/signup-available'));
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) return false;
      return Boolean(data.allowSignup);
    },
    staleTime: 30_000,
  });

  return (
    <LoginForm
      allowSignup={!isLoading && allowSignup}
      onSwitchToSignUp={() => navigate(AUTH_ROUTES.SIGNUP)}
    />
  );
};

/** /auth/signup */
export const SignUpPage = () => {
  const navigate = useNavigate();
  const { data: allowSignup = false, isLoading } = useQuery({
    queryKey: ['auth', 'signup-available'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/auth/signup-available'));
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) return false;
      return Boolean(data.allowSignup);
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="login-page login-page--center">
        <div className="hmi32-spinner" />
      </div>
    );
  }

  if (!allowSignup) {
    return <Navigate to={AUTH_ROUTES.LOGIN} replace />;
  }

  return <SignUpForm onSwitchToLogin={() => navigate(AUTH_ROUTES.LOGIN)} />;
};

export default LoginPage;
