import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { defaultAuthedPath, isAppPath } from '../routes/paths';

/** /auth/* only — logged-in users bounce to app */
const GuestRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated) {
    const from = location.state?.from?.pathname;
    return <Navigate to={isAppPath(from) ? from : defaultAuthedPath()} replace />;
  }

  return children;
};

export default GuestRoute;
