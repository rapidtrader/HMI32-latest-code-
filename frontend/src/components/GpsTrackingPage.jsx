import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import PageLayout from './PageLayout';
import { useGpsDevices, useGpsHistory, useGpsLatest } from '../hooks/useHmi32Gps';
import { useGpsRealtime } from '../hooks/useGpsRealtime';
import GpsTrackMap from './GpsTrackMap';

const fmtCoord = (n, d = 6) => {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(d) : '—';
};

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
};

export default function GpsTrackingPage() {
  const queryClient = useQueryClient();
  const [filterDevice, setFilterDevice] = useState('');
  const deviceId = filterDevice.trim() || undefined;

  const { data: devices = [], isLoading: devicesLoading } = useGpsDevices();
  const { data: latest, isLoading: latestLoading } = useGpsLatest(deviceId || devices[0]);
  const {
    data: history,
    isLoading: historyLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGpsHistory(deviceId);

  const activeDevice = deviceId || devices[0] || '';
  const { live } = useGpsRealtime(activeDevice);

  const point = live || latest;
  const rows = history?.items || [];
  const total = history?.total ?? rows.length;

  const deviceOptions = useMemo(() => {
    const set = new Set(devices);
    if (activeDevice) set.add(activeDevice);
    return [...set].sort();
  }, [devices, activeDevice]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['hmi32', 'gps'] });
  };

  const lat = point?.latitude ?? point?.lat;
  const lng = point?.longitude ?? point?.lng;

  const mapPoints = useMemo(() => {
    const byId = new Map();
    rows.forEach((r) => {
      if (r?.id) byId.set(r.id, r);
    });
    if (point?.id && !byId.has(point.id)) byId.set(point.id, point);
    else if (point && !point.id && lat != null && lng != null) {
      byId.set('live', { ...point, id: 'live' });
    } else if (point?.id) byId.set(point.id, { ...byId.get(point.id), ...point });
    return [...byId.values()];
  }, [rows, point, lat, lng]);

  const latestMapId = point?.id || (live ? 'live' : null);

  return (
    <PageLayout
      title="GPS Tracking"
      subtitle="Pi → server spool → MongoDB · live Socket.IO · history table"
      actions={
        <button type="button" className="hmi32-btn hmi32-btn--primary" onClick={refresh}>
          Refresh
        </button>
      }
    >
      <div className="hmi32-filters" style={{ marginBottom: '1rem' }}>
        <select
          className="hmi32-select"
          value={filterDevice}
          onChange={(e) => setFilterDevice(e.target.value)}
        >
          <option value="">All machines (latest per filter)</option>
          {deviceOptions.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>

      {(devicesLoading || latestLoading) && !point && (
        <p className="hmi32-muted">Loading GPS…</p>
      )}
      {error && <p className="hmi32-error">{error.message}</p>}

      <div className="hmi32-card" style={{ marginBottom: '1.25rem', overflow: 'hidden' }}>
        <div className="hmi32-side__head hmi32-side__head--green" style={{ borderRadius: '8px 8px 0 0' }}>
          Track map ({mapPoints.length} point{mapPoints.length === 1 ? '' : 's'} on map)
        </div>
        {mapPoints.length ? (
          <GpsTrackMap points={mapPoints} latestId={latestMapId} height={400} />
        ) : (
          <p className="hmi32-muted" style={{ padding: '1.25rem' }}>
            Map dikhega jab GPS points database mein aayenge. Pi par GPS on rakho aur backend deploy karo.
          </p>
        )}
      </div>

      {point && (
        <div className="hmi32-card" style={{ marginBottom: '1.25rem' }}>
          <div className="hmi32-banner hmi32-banner--compact">
            <div>
              <p className="hmi32-banner__lbl">Latest fix</p>
              <p className="hmi32-banner__id">{point.deviceId}</p>
            </div>
            <div className="hmi32-banner__right">
              <span className="hmi32-status-pill hmi32-status-pill--on">Live</span>
              <p className="hmi32-banner__event">{fmtDate(point.recorded_at)}</p>
            </div>
          </div>
          <div className="hmi32-info-section__body" style={{ padding: '1rem' }}>
            <div className="hmi32-info-row">
              <span>Coordinates</span>
              <strong>
                {fmtCoord(lat)}, {fmtCoord(lng)}
              </strong>
            </div>
            <div className="hmi32-info-row">
              <span>Speed</span>
              <strong>{Number(point.speed ?? 0).toFixed(1)} km/h</strong>
            </div>
            <div className="hmi32-info-row">
              <span>Altitude</span>
              <strong>{Number(point.altitude ?? 0).toFixed(0)} m</strong>
            </div>
            {point.satellites != null && (
              <div className="hmi32-info-row">
                <span>Satellites</span>
                <strong>{point.satellites}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="hmi32-card">
        <div className="hmi32-side__head hmi32-side__head--blue" style={{ borderRadius: '8px 8px 0 0' }}>
          History ({total} points{deviceId ? ` · ${deviceId}` : ''})
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="hmi32-table" style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Device</th>
                <th>Lat</th>
                <th>Lon</th>
                <th>Speed</th>
                <th>Sats</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading && !rows.length ? (
                <tr>
                  <td colSpan={6}>Loading…</td>
                </tr>
              ) : null}
              {!historyLoading && !rows.length ? (
                <tr>
                  <td colSpan={6}>
                    No GPS in database yet — deploy backend with /api/gps and wait for Pi fixes.
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.recorded_at)}</td>
                  <td>{r.deviceId}</td>
                  <td>{fmtCoord(r.latitude, 5)}</td>
                  <td>{fmtCoord(r.longitude, 5)}</td>
                  <td>{Number(r.speed ?? 0).toFixed(1)}</td>
                  <td>{r.satellites ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasNextPage && (
          <div style={{ padding: '1rem', textAlign: 'center' }}>
            <button
              type="button"
              className="hmi32-btn"
              disabled={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
