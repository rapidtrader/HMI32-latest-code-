import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AUTH_ROUTES } from '../routes/paths';

/** App pages only — guests go to /auth/login */
const ProtectedRoute = ({ children }) => {
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

  if (!isAuthenticated) {
    return (
      <Navigate
        to={AUTH_ROUTES.LOGIN}
        replace
        state={{ from: location }}
      />
    );
  }

  return children;
};

export default ProtectedRoute;
