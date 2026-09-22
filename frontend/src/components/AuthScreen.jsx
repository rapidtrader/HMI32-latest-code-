import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '../api/client';
import LoginForm from './LoginForm';
import SignUpForm from './SignUpForm';

const AuthScreen = () => {
  const [mode, setMode] = useState('login');

  const { data: allowSignup = false, isLoading } = useQuery({
    queryKey: ['auth', 'signup-available'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/auth/signup-available'));
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        return false;
      }
      return Boolean(data.allowSignup);
    },
    staleTime: 30_000,
  });

  if (mode === 'signup') {
    if (isLoading) {
      return (
        <div className="login-page login-page--center">
          <div className="hmi32-spinner" />
        </div>
      );
    }
    if (!allowSignup) {
      return <LoginForm allowSignup={false} onSwitchToSignUp={() => setMode('signup')} />;
    }
    return <SignUpForm onSwitchToLogin={() => setMode('login')} />;
  }

  return (
    <LoginForm
      allowSignup={!isLoading && allowSignup}
      onSwitchToSignUp={() => setMode('signup')}
    />
  );
};

export default AuthScreen;
