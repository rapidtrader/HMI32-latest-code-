import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AuthScreen from './components/AuthScreen';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Hmi32Monitor from './components/Hmi32Monitor';
import MachineInfoPage from './components/MachineInfoPage';
import ReportsPage from './components/ReportsPage';
import { ROUTES } from './routes/paths';

const App = () => {
  const { isAuthenticated, loading } = useAuth();

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

  return (
    <Routes>
      <Route
        path={ROUTES.LOGIN}
        element={isAuthenticated ? <Navigate to={ROUTES.MONITOR} replace /> : <AuthScreen />}
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="monitor" replace />} />
        <Route path="monitor" element={<Hmi32Monitor />} />
        <Route path="machine-info" element={<MachineInfoPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>

      <Route path="*" element={<Navigate to={isAuthenticated ? ROUTES.MONITOR : ROUTES.LOGIN} replace />} />
    </Routes>
  );
};

export default App;
