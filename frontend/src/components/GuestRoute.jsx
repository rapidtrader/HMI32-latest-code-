import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { defaultAuthedPath } from '../routes/paths';

/** Auth pages only — logged-in users go to the app, not stay on /auth/* */
const GuestRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="hmi32-spinner" />
          <p className="text-gray-600 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    const redirectTo = location.state?.from?.pathname || defaultAuthedPath();
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

export default GuestRoute;
