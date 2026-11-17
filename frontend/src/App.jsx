import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
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
import LiveMapPage from './components/livemap/LiveMapPage';
import SweeperMonitoringPage from './components/sweeper/SweeperMonitoringPage';
import VehicleHistoryPage from './components/vehiclehistory/VehicleHistoryPage';
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
  isAppPath,
} from './routes/paths';
const UnknownRouteRedirect = () => {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={AUTH_ROUTES.LOGIN} replace state={{ from: pathname }} />;
  }

  if (isAppPath(pathname)) {
    return <Navigate to={APP_ROUTES.MONITOR} replace />;
  }

  return <Navigate to={defaultAuthedPath()} replace />;
};

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

      {/* Protected app — absolute paths (React Router v7–safe layout route) */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path={APP_ROUTES.ROOT} element={<Navigate to={APP_ROUTES.MONITOR} replace />} />
        <Route path={APP_ROUTES.MONITOR} element={<Hmi32Monitor />} />
        <Route path={APP_ROUTES.MACHINE_INFO} element={<MachineInfoPage />} />
        <Route path={APP_ROUTES.REPORTS} element={<ReportsPage />} />
        <Route path={APP_ROUTES.CAMERA_VIDEOS} element={<CameraVideosPage />} />
        <Route path={APP_ROUTES.SAVED_VIDEOS} element={<SavedVideosPage />} />
        <Route path={APP_ROUTES.GPS} element={<GpsTrackingPage />} />
        <Route path={APP_ROUTES.LIVE_MAP} element={<LiveMapPage />} />
        <Route path={APP_ROUTES.SWEEPER_MONITORING} element={<SweeperMonitoringPage />} />
        <Route path={APP_ROUTES.VEHICLE_HISTORY} element={<VehicleHistoryPage />} />
        <Route path={APP_ROUTES.SWEEPING} element={<Navigate to={APP_ROUTES.SWEEPING_PROJECT} replace />} />
        <Route path={APP_ROUTES.SWEEPING_PROJECT} element={<SweepingProjectPage />} />
        <Route path={APP_ROUTES.SWEEPING_MACHINES} element={<SweepingMachinesPage />} />
        <Route path={APP_ROUTES.SWEEPING_ROADS} element={<SweepingRoadsPage />} />
        <Route path={APP_ROUTES.SWEEPING_DAILY_PLAN} element={<SweepingDailyPlanPage />} />
        <Route path={APP_ROUTES.SWEEPING_MACHINE_TRACKING} element={<SweepingMachineTrackingPage />} />
        <Route path={APP_ROUTES.SWEEPING_PLAN_VS_ACTUAL} element={<SweepingPlanVsActualPage />} />
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
      <Route path="*" element={<UnknownRouteRedirect />} />
    </Routes>
  );
};

export default App;