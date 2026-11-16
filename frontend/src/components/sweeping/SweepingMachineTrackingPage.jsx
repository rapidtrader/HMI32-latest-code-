import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '../PageLayout';
import { fetchSweepingProjects } from '../../api/sweepingProjects';
import { fetchMachineTracking } from '../../api/sweepingMachineTracking';
import MachineTrackingMap from './MachineTrackingMap';

const REFRESH_SEC = 30;
const PROJECTS_KEY = ['sweeping', 'projects', 'all'];
const trackKey = (projectId) => ['sweeping', 'machine-tracking', projectId];

const fmtTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(iso);
  }
};

const fmtClock = (d = new Date()) =>
  d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const StatCard = ({ label, value, tone }) => (
  <div className={`sweep-plan-stat sweep-plan-stat--${tone || 'default'}`}>
    <p className="sweep-plan-stat__label">{label}</p>
    <p className="sweep-plan-stat__value">{value}</p>
  </div>
);

const Badge = ({ children, tone }) => (
  <span className={`sweep-track-badge sweep-track-badge--${tone}`}>{children}</span>
);

async function reverseAddress(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.display_name || '';
}

const SweepingMachineTrackingPage = () => {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [focusId, setFocusId] = useState('');
  const [tick, setTick] = useState(REFRESH_SEC);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [addresses, setAddresses] = useState({});

  const projectsQuery = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () => fetchSweepingProjects({ limit: 200, page: 1, status: 'Active' }),
  });
  const projects = projectsQuery.data?.rows ?? [];

  const trackingQuery = useQuery({
    queryKey: trackKey(projectId),
    queryFn: () => fetchMachineTracking(projectId),
    enabled: Boolean(projectId),
    refetchInterval: REFRESH_SEC * 1000,
  });

  const payload = trackingQuery.data;
  const machines = payload?.machines ?? [];
  const stats = payload?.stats ?? {};

  useEffect(() => {
    if (trackingQuery.dataUpdatedAt) {
      setLastUpdated(new Date(trackingQuery.dataUpdatedAt));
      setTick(REFRESH_SEC);
    }
  }, [trackingQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!projectId) return undefined;
    const id = setInterval(() => {
      setTick((t) => {
        if (t <= 1) {
          queryClient.invalidateQueries({ queryKey: trackKey(projectId) });
          return REFRESH_SEC;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [projectId, queryClient]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const m of machines) {
        if (cancelled) break;
        if (!Number.isFinite(m.latitude) || !Number.isFinite(m.longitude)) continue;
        const key = m.machineId;
        if (addresses[key]) continue;
        try {
          const addr = await reverseAddress(m.latitude, m.longitude);
          if (!cancelled && addr) {
            setAddresses((prev) => ({ ...prev, [key]: addr }));
          }
          await new Promise((r) => setTimeout(r, 1100));
        } catch {
          /* ignore nominatim errors */
        }
      }
    };
    if (machines.length) run();
    return () => {
      cancelled = true;
    };
  }, [machines]);

  const projectLabel = useMemo(() => {
    const p = projects.find((x) => x.projectId === projectId);
    return p ? `${p.projectName} (${p.projectId})` : '';
  }, [projects, projectId]);

  const refresh = () => {
    if (!projectId) return;
    queryClient.invalidateQueries({ queryKey: trackKey(projectId) });
    setTick(REFRESH_SEC);
  };

  return (
    <PageLayout
      title="Machine Tracking"
      subtitle="Live GPS status from fleet, gps_locations & HMI telemetry"
      loading={projectsQuery.isLoading && !projects.length}
      error={trackingQuery.error}
    >
      <div className="sweep-track">
        <div className="sweep-track__meta">
          <span>Updated: {lastUpdated ? fmtClock(lastUpdated) : '—'}</span>
          <span className="sweep-track__countdown">Refresh in {tick}s</span>
        </div>

        <div className="hmi32-card sweep-track__filter-card">
          <div className="sweep-daily-plan__generate-body" style={{ padding: '0.85rem 1rem' }}>
            <label className="sweep-field sweep-daily-plan__field">
              <span>Project</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="hmi32-select">
                <option value="">— Select Project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.projectId}>
                    {p.projectName} ({p.projectId})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="hmi32-btn sweep-btn--violet"
              disabled={!projectId || trackingQuery.isFetching}
              onClick={refresh}
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {!projectId ? (
          <div className="sweep-daily-plan__empty">Select a project to view live machine GPS status.</div>
        ) : (
          <>
            <div className="sweep-plan-stats sweep-track-stats">
              <StatCard label="Total" value={stats.total ?? 0} />
              <StatCard label="GPS Reporting" value={stats.gpsReporting ?? 0} tone="blue" />
              <StatCard label="Ignition ON" value={stats.ignitionOn ?? 0} tone="ok" />
              <StatCard label="Ignition OFF" value={stats.ignitionOff ?? 0} />
              <StatCard label="Status Unknown" value={stats.ignitionUnknown ?? 0} tone="warn" />
            </div>

            <div className="hmi32-card sweep-track__map-card">
              <div className="sweep-machine-form__card-head">Live Map</div>
              <MachineTrackingMap machines={machines} focusId={focusId} height={400} />
            </div>

            <div className="hmi32-card sweep-projects__card" style={{ marginTop: '1rem' }}>
              <div className="hmi32-table-scroll">
                <table className="hmi32-table sweep-table sweep-track-table">
                  <thead>
                    <tr>
                      <th>Machine ID</th>
                      <th>Machine Name</th>
                      <th>Vehicle No</th>
                      <th>GPS</th>
                      <th>Speed</th>
                      <th>Ignition</th>
                      <th>Sweeping</th>
                      <th>Last Update</th>
                      <th>Location</th>
                      <th>Address</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machines.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="hmi32-empty-msg">
                          No active machines for {projectLabel || 'project'}.
                        </td>
                      </tr>
                    ) : (
                      machines.map((m) => (
                        <tr key={m.machineId}>
                          <td className="hmi32-table__mid">{m.machineId}</td>
                          <td>{m.machineName}</td>
                          <td>{m.vehicleNumber || '—'}</td>
                          <td>
                            <Badge tone={m.gpsStatus === 'Live' ? 'live' : 'muted'}>
                              {m.gpsStatus === 'Live' ? '● Live' : m.gpsStatus}
                            </Badge>
                          </td>
                          <td>{m.speedKmh} KM/H</td>
                          <td>
                            <Badge tone={m.ignition === 'ON' ? 'ok' : m.ignition === 'OFF' ? 'muted' : 'warn'}>
                              {m.ignition}
                            </Badge>
                          </td>
                          <td>
                            <Badge tone={m.sweeping === 'Sweeping' ? 'ok' : 'muted'}>{m.sweeping}</Badge>
                          </td>
                          <td className="hmi32-table__muted">{fmtTime(m.lastUpdate)}</td>
                          <td className="hmi32-table__muted">
                            {Number.isFinite(m.latitude) ? (
                              <>
                                {Number(m.latitude).toFixed(6)}, {Number(m.longitude).toFixed(6)}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="sweep-track-address">{addresses[m.machineId] || '—'}</td>
                          <td>
                            <button
                              type="button"
                              className="hmi32-btn hmi32-btn--ghost sweep-track-focus"
                              disabled={!Number.isFinite(m.latitude)}
                              onClick={() => setFocusId(m.machineId)}
                            >
                              Focus
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default SweepingMachineTrackingPage;