import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '../PageLayout';
import { fetchVehicleHistory, fetchVehicleHistoryVehicles } from '../../api/vehicleHistory';
import VehicleHistoryMap from './VehicleHistoryMap';

const todayIso = () => new Date().toISOString().slice(0, 10);
const VEHICLES_KEY = ['vehicle-history', 'vehicles'];

const fmtTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
};

const fmtSync = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
};

const VehicleHistoryPage = () => {
  const queryClient = useQueryClient();
  const [deviceId, setDeviceId] = useState('');
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [applied, setApplied] = useState(null);
  const [playIndex, setPlayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const playRef = useRef(null);

  const vehiclesQuery = useQuery({
    queryKey: VEHICLES_KEY,
    queryFn: fetchVehicleHistoryVehicles,
  });

  const historyQuery = useQuery({
    queryKey: ['vehicle-history', applied],
    queryFn: () =>
      fetchVehicleHistory({
        deviceId: applied.deviceId,
        from: applied.from,
        to: applied.to,
      }),
    enabled: Boolean(applied),
  });

  const points = historyQuery.data?.points ?? [];
  const total = points.length;

  useEffect(() => {
    setPlayIndex(0);
    setPlaying(false);
  }, [historyQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!playing || total === 0) {
      if (playRef.current) clearInterval(playRef.current);
      playRef.current = null;
      return undefined;
    }
    playRef.current = setInterval(() => {
      setPlayIndex((i) => {
        if (i >= total - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 600);
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [playing, total]);

  useEffect(() => {
    if (!autoSync || !applied) return undefined;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-history', applied] });
    }, 60_000);
    return () => clearInterval(id);
  }, [autoSync, applied, queryClient]);

  const lastSynced = historyQuery.data?.syncedAt || (historyQuery.dataUpdatedAt ? new Date(historyQuery.dataUpdatedAt).toISOString() : null);

  const applyFilter = () => {
    if (!deviceId) return;
    setApplied({ deviceId, from: fromDate, to: toDate });
  };

  const syncFresh = () => {
    if (!applied) applyFilter();
    else queryClient.invalidateQueries({ queryKey: ['vehicle-history', applied] });
    setAutoSync(true);
  };

  const controls = useMemo(
    () => ({
      stop: () => {
        setPlaying(false);
        setPlayIndex(0);
      },
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      rewind: () => setPlayIndex((i) => Math.max(0, i - 10)),
      forward: () => setPlayIndex((i) => Math.min(total - 1, i + 10)),
      prev: () => setPlayIndex((i) => Math.max(0, i - 1)),
      next: () => setPlayIndex((i) => Math.min(total - 1, i + 1)),
    }),
    [total],
  );

  return (
    <PageLayout
      title="Vehicle History"
      subtitle="Playback GPS trail with speed, distance and status"
      loading={vehiclesQuery.isLoading && !vehiclesQuery.data}
      error={historyQuery.error}
    >
      <div className="veh-hist">
        <div className="hmi32-card veh-hist__filters">
          <div className="veh-hist__filter-grid">
            <label className="sweep-field">
              <span>Vehicle</span>
              <select className="hmi32-select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                <option value="">— Select —</option>
                {(vehiclesQuery.data || []).map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <label className="sweep-field">
              <span>From Date</span>
              <input type="date" className="hmi32-select" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="sweep-field">
              <span>To Date</span>
              <input type="date" className="hmi32-select" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </div>
          <div className="veh-hist__filter-actions">
            <button type="button" className="hmi32-btn sweep-btn--violet veh-hist__btn" onClick={applyFilter} disabled={!deviceId}>
              ▾ APPLY FILTER
            </button>
            <button
              type="button"
              className="hmi32-btn sweep-btn--violet veh-hist__btn"
              onClick={syncFresh}
              disabled={!deviceId || historyQuery.isFetching}
            >
              ↻ SYNC FRESH
            </button>
          </div>
          {lastSynced && (
            <p className="veh-hist__sync-note">
              Last synced: {fmtSync(lastSynced)}
              {autoSync ? ' · auto every 1 min' : ''}
            </p>
          )}
        </div>

        {!applied ? (
          <div className="sweep-daily-plan__empty">Select vehicle and dates, then Apply Filter.</div>
        ) : historyQuery.isFetching && !points.length ? (
          <div className="sweep-daily-plan__empty">Loading history…</div>
        ) : !points.length ? (
          <div className="sweep-daily-plan__empty">No GPS points for this vehicle and date range.</div>
        ) : (
          <>
            <div className="veh-hist__player">
              <div className="veh-hist__controls">
                <button type="button" className="veh-hist__ctrl" onClick={controls.stop} title="Stop">
                  ⏹
                </button>
                <button type="button" className="veh-hist__ctrl" onClick={controls.rewind} title="Rewind">
                  ⏪
                </button>
                <button type="button" className="veh-hist__ctrl" onClick={controls.prev} title="Previous">
                  ⏮
                </button>
                {playing ? (
                  <button type="button" className="veh-hist__ctrl veh-hist__ctrl--main" onClick={controls.pause}>
                    ⏸
                  </button>
                ) : (
                  <button type="button" className="veh-hist__ctrl veh-hist__ctrl--main" onClick={controls.play}>
                    ▶
                  </button>
                )}
                <button type="button" className="veh-hist__ctrl" onClick={controls.forward} title="Fast forward">
                  ⏩
                </button>
              </div>
              <input
                type="range"
                className="veh-hist__slider"
                min={0}
                max={Math.max(0, total - 1)}
                value={playIndex}
                onChange={(e) => {
                  setPlaying(false);
                  setPlayIndex(Number(e.target.value));
                }}
              />
              <span className="veh-hist__counter">
                {playIndex + 1} / {total}
              </span>
            </div>

            <div className="hmi32-card veh-hist__map-card">
              <VehicleHistoryMap points={points} activeIndex={playIndex} height={400} />
            </div>

            <div className="hmi32-card sweep-projects__card veh-hist__table-wrap">
              <div className="hmi32-table-scroll">
                <table className="hmi32-table sweep-table veh-hist-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Lat/Long</th>
                      <th>Speed (km/h)</th>
                      <th>Distance</th>
                      <th>Status</th>
                      <th>Fuel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p, idx) => (
                      <tr
                        key={p.id || idx}
                        className={idx === playIndex ? 'veh-hist-table__active' : ''}
                        onClick={() => {
                          setPlaying(false);
                          setPlayIndex(idx);
                        }}
                      >
                        <td>{fmtTime(p.recorded_at)}</td>
                        <td>
                          {Number(p.latitude).toFixed(6)}, {Number(p.longitude).toFixed(6)}
                        </td>
                        <td>{p.speed}</td>
                        <td>{p.distanceKm}</td>
                        <td>{p.status}</td>
                        <td>{p.fuel}</td>
                      </tr>
                    ))}
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

export default VehicleHistoryPage;