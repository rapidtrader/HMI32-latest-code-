import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLiveMapFleet } from '../../api/liveMap';
import FleetLiveMap from './FleetLiveMap';
import { useGpsFleetRealtime } from '../../hooks/useGpsFleetRealtime';

const FLEET_KEY = ['live-map', 'fleet'];
const REFRESH_MS = 15000;

const STATUS_FILTERS = [
  { id: 'ALL', label: 'ALL', tone: 'all' },
  { id: 'RUNNING', label: 'RUNNING', tone: 'running' },
  { id: 'STOPPED', label: 'STOPPED', tone: 'stopped' },
  { id: 'OVERSPEED', label: 'OVERSPEED', tone: 'overspeed' },
  { id: 'IDLE', label: 'IDLE', tone: 'idle' },
  { id: 'UNREACHABLE', label: 'UNREACHABLE', tone: 'unreachable' },
  { id: 'NEW', label: 'NEW', tone: 'new' },
  { id: 'INACTIVE', label: 'INACTIVE', tone: 'inactive' },
];

const fmtLu = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

const fmtSince = (iso) => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

async function reverseAddress(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return '';
  const data = await res.json();
  return data.display_name || '';
}

const LiveMapPage = () => {
  useGpsFleetRealtime();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [focusId, setFocusId] = useState('');
  const [showMarkers, setShowMarkers] = useState(true);
  const [addresses, setAddresses] = useState({});

  const fleetQuery = useQuery({
    queryKey: FLEET_KEY,
    queryFn: fetchLiveMapFleet,
    refetchInterval: REFRESH_MS,
  });

  const fleet = fleetQuery.data;
  const vehicles = fleet?.vehicles ?? [];
  const stats = fleet?.stats ?? {};

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      const matchesStatus = statusFilter === 'ALL' || v.status === statusFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        String(v.machineId || v.deviceId).toLowerCase().includes(q) ||
        String(v.deviceId).toLowerCase().includes(q) ||
        String(v.clientName || v.machineName).toLowerCase().includes(q) ||
        String(v.vehiclePlateNo).toLowerCase().includes(q) ||
        String(v.location).toLowerCase().includes(q)
      );
    });
  }, [vehicles, search, statusFilter]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: FLEET_KEY });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const v of filtered.slice(0, 12)) {
        if (cancelled) break;
        if (!Number.isFinite(v.latitude)) continue;
        const key = v.deviceId;
        if (addresses[key]) continue;
        try {
          const addr = await reverseAddress(v.latitude, v.longitude);
          if (!cancelled && addr) setAddresses((p) => ({ ...p, [key]: addr }));
          await new Promise((r) => setTimeout(r, 1100));
        } catch {
          /* skip */
        }
      }
    };
    if (filtered.length) run();
    return () => {
      cancelled = true;
    };
  }, [filtered]);

  return (
    <div className="live-map-page">
      <header className="live-map-page__head">
        <div>
          <h1>GPS Tracking</h1>
          <p>Live Map · same latest fix as GPS Tracking (gps_locations)</p>
        </div>
        <div className="live-map-page__head-meta">
          <span>Updated: {fleet?.updatedAt ? fmtLu(fleet.updatedAt) : '—'}</span>
          {fleet?.dataSource === 'gps-fallback' && (
            <span className="live-map-db-badge live-map-db-badge--hint" title="Production server has no /api/live-map yet — built from GPS latest">
              GPS latest
            </span>
          )}
          <button type="button" className="live-map-db-badge" onClick={refresh}>
            Refresh
          </button>
        </div>
      </header>

      <div className="live-map-toolbar">
        <div className="live-map-search">
          <span className="live-map-search__icon" aria-hidden>
            ⌕
          </span>
          <input
            type="search"
            placeholder="Search Vehicle"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button type="button" className="hmi32-btn hmi32-btn--ghost live-map-filter-btn">
          FILTER
        </button>
      </div>

      {fleetQuery.isError && (
        <p className="live-map-list__empty" style={{ margin: '0 0 0.75rem' }}>
          {fleetQuery.error?.message || 'Could not load fleet'}
        </p>
      )}

      <div className="live-map-status-row">
        {STATUS_FILTERS.map((s) => {
          const count = s.id === 'ALL' ? stats.all ?? 0 : stats[s.id.toLowerCase()] ?? 0;
          const active = statusFilter === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`live-map-status-pill live-map-status-pill--${s.tone} ${active ? 'live-map-status-pill--active' : ''}`}
              onClick={() => setStatusFilter(s.id)}
            >
              <span>{s.label}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>

      <div className="live-map-body">
        <aside className="live-map-list">
          <h2>GPS vehicles ({filtered.length})</h2>
          <div className="live-map-list__scroll">
            {fleetQuery.isLoading && !fleet ? (
              <p className="live-map-list__empty">Loading fleet…</p>
            ) : filtered.length === 0 ? (
              <p className="live-map-list__empty">
                {vehicles.length === 0
                  ? 'No GPS fixes in database — check GPS Tracking page or deploy backend with live-map API.'
                  : 'No vehicles match filters.'}
              </p>
            ) : (
              filtered.map((v) => (
                <button
                  key={v.deviceId}
                  type="button"
                  className={`live-map-vehicle ${focusId === v.deviceId ? 'live-map-vehicle--focus' : ''}`}
                  onClick={() => setFocusId(v.deviceId)}
                >
                  <p className="live-map-vehicle__id-lbl">Machine ID · GPS</p>
                  <div className="live-map-vehicle__top">
                    <strong className="live-map-vehicle__mid" title="Same as GPS deviceId">
                      {v.machineId || v.deviceId}
                    </strong>
                    <span className="live-map-vehicle__type">{v.vehicleType}</span>
                    {v.hmiOnline ? (
                      <span className="live-map-vehicle__online">HMI online</span>
                    ) : null}
                    <span className="live-map-vehicle__signal">{v.signalPct}%</span>
                  </div>
                  <p className="live-map-vehicle__name">
                    {v.clientName || v.machineName || '—'}
                  </p>
                  {v.vehiclePlateNo ? (
                    <p className="live-map-vehicle__meta">
                      Plate <strong>{v.vehiclePlateNo}</strong>
                    </p>
                  ) : null}
                  {v.location ? (
                    <p className="live-map-vehicle__meta">
                      Location <strong>{v.location}</strong>
                    </p>
                  ) : null}
                  {!v.machineInfoRegistered && (
                    <p className="live-map-vehicle__meta live-map-vehicle__meta--muted">
                      Not in Machine Info DB
                    </p>
                  )}
                  <p className="live-map-vehicle__lu">
                    <span>LU:</span> {fmtLu(v.lastUpdate)}
                  </p>
                  <div className="live-map-vehicle__grid">
                    <span>
                      Since <strong>{fmtSince(v.lastUpdate)}</strong>
                    </span>
                    <span>
                      SPD <strong>{v.speedKmh} kmph</strong>
                    </span>
                    <span>
                      DISTANCE <strong>{v.distanceKm} km</strong>
                    </span>
                  </div>
                  <p className="live-map-vehicle__addr">
                    📍 {addresses[v.deviceId] || (Number.isFinite(v.latitude)
                      ? `${Number(v.latitude).toFixed(5)}, ${Number(v.longitude).toFixed(5)}`
                      : 'No GPS fix')}
                  </p>
                  <span className={`live-map-vehicle__status live-map-vehicle__status--${v.status.toLowerCase()}`}>
                    {v.status}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="live-map-map-panel">
          <div className="live-map-map-panel__head">
            <span>Live Map</span>
            <label className="live-map-marker-toggle">
              <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
              Vehicle Marker
            </label>
          </div>
          <FleetLiveMap vehicles={filtered} focusId={focusId} showMarkers={showMarkers} />
        </section>
      </div>
    </div>
  );
};

export default LiveMapPage;