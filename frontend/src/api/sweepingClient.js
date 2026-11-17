import { getApiBaseLabel } from './client';

export const SWEEPING_API_MISSING_MSG =
  'Sweeping API is not on the server you are calling. For local dev: set VITE_DEV_PROXY_TARGET=http://127.0.0.1:4002 in frontend/.env.development, run `npm start` in backend, then restart `npm run dev`.';

/** Parse sweeping list/detail JSON; optional empty payload when remote server has no /api/sweeping yet. */
export async function parseSweepingJson(res, { emptyList = false, emptyListDefaults = {} } = {}) {
  if (res.status === 404) {
    if (emptyList) {
      return {
        success: true,
        rows: [],
        data: [],
        total: 0,
        totalPages: 1,
        page: 1,
        limit: 10,
        apiMissing: true,
        message: `${SWEEPING_API_MISSING_MSG} (proxy: ${getApiBaseLabel()})`,
        ...emptyListDefaults,
      };
    }
    const err = new Error(SWEEPING_API_MISSING_MSG);
    err.code = 'SWEEPING_API_MISSING';
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}