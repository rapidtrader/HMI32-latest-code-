import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageLayout from '../PageLayout';
import { fetchSweeperMonitoringReport } from '../../api/sweeperMonitoring';

const todayIso = () => new Date().toISOString().slice(0, 10);

const fmtDuration = (sec) => {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

const fmtTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

const SweeperMonitoringPage = () => {
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [category, setCategory] = useState('Sweeper');
  const [sweeperId, setSweeperId] = useState('all');
  const [applied, setApplied] = useState(null);

  const reportQuery = useQuery({
    queryKey: ['sweeper-monitoring', applied],
    queryFn: () =>
      fetchSweeperMonitoringReport({
        from: applied.from,
        to: applied.to,
        category: applied.category,
        machineId: applied.sweeperId,
      }),
    enabled: Boolean(applied),
  });

  const report = reportQuery.data;
  const threshold = report?.speedThresholdKmh ?? 8;

  const sweeperOptions = useMemo(() => {
    const list = report?.availableSweepers ?? report?.vehicles?.map((v) => v.deviceId) ?? [];
    return [...new Set(list)].sort();
  }, [report]);

  const displayVehicles = useMemo(() => {
    if (!report?.vehicles) return [];
    if (applied?.sweeperId && applied.sweeperId !== 'all') {
      return report.vehicles.filter((v) => v.deviceId === applied.sweeperId);
    }
    return report.vehicles;
  }, [report, applied]);

  const applyFilter = () => {
    setApplied({ from: fromDate, to: toDate, category, sweeperId });
  };

  const totals = report?.totals;

  return (
    <PageLayout
      title="Sweeper Monitoring"
      subtitle="Sweeping vs non-sweeping time & distance from GPS speed"
      loading={reportQuery.isLoading && applied && !report}
      error={reportQuery.error}
    >
      <div className="sweeper-mon">
        <div className="hmi32-card sweeper-mon__filters">
          <div className="sweeper-mon__filter-grid">
            <label className="sweep-field">
              <span>From Date</span>
              <input type="date" className="hmi32-select" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="sweep-field">
              <span>To Date</span>
              <input type="date" className="hmi32-select" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
            <label className="sweep-field">
              <span>Category</span>
              <select className="hmi32-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="Sweeper">Sweeper</option>
                <option value="All">All</option>
              </select>
            </label>
            <label className="sweep-field">
              <span>Sweeper</span>
              <select className="hmi32-select" value={sweeperId} onChange={(e) => setSweeperId(e.target.value)}>
                <option value="all">All Sweeper</option>
                {sweeperOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="sweeper-mon__apply"
            disabled={reportQuery.isFetching}
            onClick={applyFilter}
          >
            ↻ Apply Filter
          </button>
        </div>

        {!applied ? (
          <div className="sweep-daily-plan__empty">Select dates and click Apply Filter to view sweeper monitoring.</div>
        ) : (
          <>
            <div className="sweeper-mon__kpis">
              <div className="sweeper-mon__kpi sweeper-mon__kpi--green">
                <span className="sweeper-mon__kpi-ico">⏱</span>
                <p>Sweeping Time</p>
                <strong>{fmtDuration(totals?.sweepingSec)}</strong>
              </div>
              <div className="sweeper-mon__kpi sweeper-mon__kpi--green">
                <span className="sweeper-mon__kpi-ico">📍</span>
                <p>Sweeping KM</p>
                <strong>{totals?.sweepingKm ?? 0} km</strong>
              </div>
              <div className="sweeper-mon__kpi sweeper-mon__kpi--orange">
                <span className="sweeper-mon__kpi-ico">⏱</span>
                <p>Non-Sweeping Time</p>
                <strong>{fmtDuration(totals?.nonSweepingSec)}</strong>
              </div>
              <div className="sweeper-mon__kpi sweeper-mon__kpi--orange">
                <span className="sweeper-mon__kpi-ico">📍</span>
                <p>Non-Sweeping KM</p>
                <strong>{totals?.nonSweepingKm ?? 0} km</strong>
              </div>
            </div>

            <div className="sweeper-mon__section-head">
              <h2>
                Sweeper ({report?.fleetWithData ?? 0}/{report?.fleetTotal ?? 0})
              </h2>
              <span>Last update {report?.lastUpdate ? fmtTime(report.lastUpdate) : '—'}</span>
            </div>

            <div className="sweeper-mon__grid">
              {displayVehicles.map((v) => (
                <article key={v.deviceId} className="sweeper-mon__vehicle">
                  <div className="sweeper-mon__vehicle-head">
                    <div>
                      <span className={`sweeper-mon__dot ${v.gpsOnline ? 'sweeper-mon__dot--on' : ''}`} />
                      <strong>{v.deviceId}</strong>
                      <span className="sweeper-mon__van">{v.vehicleType}</span>
                    </div>
                    <span className="sweeper-mon__truck" aria-hidden>
                      🚛
                    </span>
                  </div>
                  <p className="sweeper-mon__gps-line">
                    {v.gpsOnline ? `GPS Online - ${fmtTime(v.gpsLastAt)}` : 'GPS Offline'}
                  </p>

                  <div className="sweeper-mon__split">
                    <div className="sweeper-mon__panel sweeper-mon__panel--green">
                      <p className="sweeper-mon__panel-title">
                        🧹 Sweeping (Speed &lt; {threshold} km/h)
                      </p>
                      <p>
                        Total Time <strong>{fmtDuration(v.sweeping?.sweepingSec)}</strong>
                      </p>
                      <p>
                        Total Distance <strong>{v.sweeping?.sweepingKm ?? 0} km</strong>
                      </p>
                      <button type="button" className="sweeper-mon__details">
                        View Details &gt;
                      </button>
                    </div>
                    <div className="sweeper-mon__panel sweeper-mon__panel--orange">
                      <p className="sweeper-mon__panel-title">
                        🚗 Non-Sweeping (Speed &gt; {threshold} km/h)
                      </p>
                      <p>
                        Total Time <strong>{fmtDuration(v.nonSweeping?.timeSec)}</strong>
                      </p>
                      <p>
                        Total Distance <strong>{v.nonSweeping?.km ?? 0} km</strong>
                      </p>
                      <button type="button" className="sweeper-mon__details sweeper-mon__details--orange">
                        View Details &gt;
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default SweeperMonitoringPage;