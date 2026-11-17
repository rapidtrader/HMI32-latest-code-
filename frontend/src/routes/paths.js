/** Public auth URLs — never nest under /app */
export const AUTH_ROUTES = {
  ROOT: '/auth',
  LOGIN: '/auth/login',
  SIGNUP: '/auth/signup',
};

/** Logged-in app URLs — all live under /app */
export const APP_ROUTES = {
  ROOT: '/app',
  MONITOR: '/app/monitor',
  MACHINE_INFO: '/app/machine-info',
  REPORTS: '/app/reports',
  CAMERA_VIDEOS: '/app/camera-videos',
  SAVED_VIDEOS: '/app/saved-videos',
  GPS: '/app/gps',
  LIVE_MAP: '/app/live-map',
  SWEEPER_MONITORING: '/app/sweeper-monitoring',
  VEHICLE_HISTORY: '/app/vehicle-history',
  SWEEPING: '/app/sweeping-mgmt',
  SWEEPING_PROJECT: '/app/sweeping-mgmt/project',
  SWEEPING_MACHINES: '/app/sweeping-mgmt/machines',
  SWEEPING_ROADS: '/app/sweeping-mgmt/roads',
  SWEEPING_DAILY_PLAN: '/app/sweeping-mgmt/daily-plan',
  SWEEPING_MACHINE_TRACKING: '/app/sweeping-mgmt/machine-tracking',
  SWEEPING_PLAN_VS_ACTUAL: '/app/sweeping-mgmt/plan-vs-actual',
};

/** Convenience aliases used across the UI */
export const ROUTES = {
  LOGIN: AUTH_ROUTES.LOGIN,
  SIGNUP: AUTH_ROUTES.SIGNUP,
  APP: APP_ROUTES.ROOT,
  MONITOR: APP_ROUTES.MONITOR,
  MACHINE_INFO: APP_ROUTES.MACHINE_INFO,
  REPORTS: APP_ROUTES.REPORTS,
  CAMERA_VIDEOS: APP_ROUTES.CAMERA_VIDEOS,
  SAVED_VIDEOS: APP_ROUTES.SAVED_VIDEOS,
  GPS: APP_ROUTES.GPS,
  LIVE_MAP: APP_ROUTES.LIVE_MAP,
  SWEEPER_MONITORING: APP_ROUTES.SWEEPER_MONITORING,
  VEHICLE_HISTORY: APP_ROUTES.VEHICLE_HISTORY,
  SWEEPING: APP_ROUTES.SWEEPING,
  SWEEPING_PROJECT: APP_ROUTES.SWEEPING_PROJECT,
  SWEEPING_MACHINES: APP_ROUTES.SWEEPING_MACHINES,
  SWEEPING_ROADS: APP_ROUTES.SWEEPING_ROADS,
  SWEEPING_DAILY_PLAN: APP_ROUTES.SWEEPING_DAILY_PLAN,
  SWEEPING_MACHINE_TRACKING: APP_ROUTES.SWEEPING_MACHINE_TRACKING,
  SWEEPING_PLAN_VS_ACTUAL: APP_ROUTES.SWEEPING_PLAN_VS_ACTUAL,
};

/** Old bookmarks → new paths */
export const LEGACY_REDIRECTS = [
  { from: '/login', to: AUTH_ROUTES.LOGIN },
  { from: '/signup', to: AUTH_ROUTES.SIGNUP },
  { from: '/monitor', to: APP_ROUTES.MONITOR },
  { from: '/machine-info', to: APP_ROUTES.MACHINE_INFO },
  { from: '/reports', to: APP_ROUTES.REPORTS },
  { from: '/camera-videos', to: APP_ROUTES.CAMERA_VIDEOS },
  { from: '/saved-videos', to: APP_ROUTES.SAVED_VIDEOS },
  { from: '/gps', to: APP_ROUTES.GPS },
  { from: '/live-map', to: APP_ROUTES.LIVE_MAP },
  { from: '/sweeper-monitoring', to: APP_ROUTES.SWEEPER_MONITORING },
  { from: '/vehicle-history', to: APP_ROUTES.VEHICLE_HISTORY },
];

export function defaultAuthedPath() {
  return APP_ROUTES.MONITOR;
}

export function isAppPath(pathname = '') {
  return pathname === APP_ROUTES.ROOT || pathname.startsWith(`${APP_ROUTES.ROOT}/`);
}

export function isAuthPath(pathname = '') {
  return pathname === AUTH_ROUTES.ROOT || pathname.startsWith(`${AUTH_ROUTES.ROOT}/`);
}
