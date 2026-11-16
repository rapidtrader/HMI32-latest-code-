import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AuthLayout from './components/AuthLayout';
import AppLayout from './components/AppLayout';
import GuestRoute from './components/GuestRoute';
import ProtectedRoute from './components/ProtectedRoute';
import { LoginPage, SignUpPage } from './components/AuthScreen';
import Hmi32Monitor from './components/Hmi32Monitor';
import MachineInfoPage from './components/MachineInfoPage';
import ReportsPage from './components/ReportsPage';
import CameraVideosPage from './components/CameraVideosPage';
import SavedVideosPage from './components/SavedVideosPage';
import GpsTrackingPage from './components/GpsTrackingPage';
import {
  SweepingProjectPage,
  SweepingMachinesPage,
  SweepingRoadsPage,
  SweepingDailyPlanPage,
  SweepingMachineTrackingPage,
  SweepingPlanVsActualPage,
} from './components/sweeping/SweepingMgmtPages';
import {
  AUTH_ROUTES,
  APP_ROUTES,
  LEGACY_REDIRECTS,
  defaultAuthedPath,
} from './routes/paths';

const App = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public auth — /auth/login, /auth/signup */}
      <Route
        path={AUTH_ROUTES.ROOT}
        element={
          <GuestRoute>
            <AuthLayout />
          </GuestRoute>
        }
      >
        <Route index element={<Navigate to={AUTH_ROUTES.LOGIN} replace />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignUpPage />} />
      </Route>

      {/* Protected app — /app/* */}
      <Route
        path={APP_ROUTES.ROOT}
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
        <Route path="camera-videos" element={<CameraVideosPage />} />
        <Route path="saved-videos" element={<SavedVideosPage />} />
        <Route path="gps" element={<GpsTrackingPage />} />
        <Route path="sweeping-mgmt" element={<Navigate to="project" replace />} />
        <Route path="sweeping-mgmt/project" element={<SweepingProjectPage />} />
        <Route path="sweeping-mgmt/machines" element={<SweepingMachinesPage />} />
        <Route path="sweeping-mgmt/roads" element={<SweepingRoadsPage />} />
        <Route path="sweeping-mgmt/daily-plan" element={<SweepingDailyPlanPage />} />
        <Route path="sweeping-mgmt/machine-tracking" element={<SweepingMachineTrackingPage />} />
        <Route path="sweeping-mgmt/plan-vs-actual" element={<SweepingPlanVsActualPage />} />
      </Route>

      {LEGACY_REDIRECTS.map(({ from, to }) => (
        <Route key={from} path={from} element={<Navigate to={to} replace />} />
      ))}

      <Route
        path="/"
        element={
          <Navigate
            to={isAuthenticated ? defaultAuthedPath() : AUTH_ROUTES.LOGIN}
            replace
          />
        }
      />
      <Route
        path="*"
        element={
          <Navigate
            to={isAuthenticated ? defaultAuthedPath() : AUTH_ROUTES.LOGIN}
            replace
          />
        }
      />
    </Routes>
  );
};

export default App;
