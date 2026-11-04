import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AUTH_ROUTES } from '../routes/paths';

/** /app/* only */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

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
