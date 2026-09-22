import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useReportsSessions, useReportsRuntime } from '../hooks/useHmi32Queries';
import PageLayout from './PageLayout';

const fmtDuration = (sec) => {
  if (!sec || sec <= 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const SummaryStat = ({ tone, icon, title, value, sub }) => (
  <div className="hmi32-stat">
    <div className={`hmi32-stat__icon hmi32-stat__icon--${tone}`}>{icon}</div>
    <div>
      <p className="hmi32-stat__label">{title}</p>
      <p className="hmi32-stat__value">{value}</p>
      {sub && <p className="hmi32-stat__sub">{sub}</p>}
    </div>
  </div>
);

const ReportsPage = () => {
  const queryClient = useQueryClient();
  const { data: sessions = [], isLoading: sessionsLoading, error: sessionsError } = useReportsSessions();
  const { data: runtime, isLoading: runtimeLoading } = useReportsRuntime();
  const [filterDate, setFilterDate] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const loading = sessionsLoading || runtimeLoading;
  const error = sessionsError;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['hmi32', 'reports'] });
  };

  const machineIds = [...new Set(sessions.map((s) => s.machine_id).filter(Boolean))];
  const filtered = sessions.filter((s) => {
    if (filterDate && s.date !== filterDate) return false;
    if (filterMachine && s.machine_id !== filterMachine) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const getDur = (s) => Number(s.total_running_time || s.duration_sec || 0);
  const totalDuration = filtered.reduce((sum, s) => sum + getDur(s), 0);
  const avgDuration = filtered.length > 0 ? totalDuration / filtered.length : 0;
  const maxSession = filtered.length > 0 ? Math.max(...filtered.map(getDur)) : 0;
  const dailyData = runtime?.daily_seconds || {};
  const sortedDates = Object.keys(dailyData).sort().reverse();

  return (
    <PageLayout
      title="Reports"
      subtitle="Suction sessions & machine runtime history"
      loading={loading}
      loadingText="Loading Reports..."
      error={error}
      onRefresh={refresh}
    >
      <div className="hmi32-stats hmi32-stats--4">
        <SummaryStat
          tone="blue"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" strokeLinecap="round" />
            </svg>
          }
          title="Total Suction Time"
          value={fmtDuration(runtime?.suction_total_seconds || 0)}
          sub="all time"
        />
        <SummaryStat
          tone="green"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
          }
          title="Total Sessions"
          value={filtered.length}
          sub={filterDate || filterMachine ? 'filtered' : 'all sessions'}
        />
        <SummaryStat
          tone="purple"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19h16M6 16l3-8 3 4 3-6 3 10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          title="Avg Session"
          value={fmtDuration(avgDuration)}
          sub="filtered"
        />
        <SummaryStat
          tone="blue"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v18M8 8l4-4 4 4M8 16l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          title="Longest Session"
          value={fmtDuration(maxSession)}
          sub="filtered"
        />
      </div>

      {sortedDates.length > 0 && (
        <div className="hmi32-card hmi32-section">
          <div className="hmi32-card__head">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="hmi32-card__head-icon">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
            </svg>
            <h2>Daily Runtime</h2>
          </div>
          <div className="hmi32-table-scroll">
            <table className="hmi32-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Duration</th>
                  <th>Activity</th>
                </tr>
              </thead>
              <tbody>
                {sortedDates.slice(0, 10).map((date) => {
                  const secs = dailyData[date] || 0;
                  const maxSecs = Math.max(...Object.values(dailyData));
                  const pct = maxSecs > 0 ? Math.round((secs / maxSecs) * 100) : 0;
                  return (
                    <tr key={date}>
                      <td className="hmi32-table__mid">{date}</td>
                      <td>{fmtDuration(secs)}</td>
                      <td>
                        <div className="hmi32-progress">
                          <div className="hmi32-progress__bar" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="hmi32-card hmi32-section">
        <div className="hmi32-card__head hmi32-card__head--split">
          <div className="hmi32-card__head-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="hmi32-card__head-icon">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
            <h2>Suction Sessions</h2>
          </div>
          <div className="hmi32-filters">
            <input
              type="date"
              value={filterDate}
              onChange={(e) => {
                setFilterDate(e.target.value);
                setPage(1);
              }}
              className="hmi32-filter-input"
            />
            <select
              value={filterMachine}
              onChange={(e) => {
                setFilterMachine(e.target.value);
                setPage(1);
              }}
              className="hmi32-filter-input"
            >
              <option value="">All Machines</option>
              {machineIds.map((id) => (
                <option key={id} value={id}>{id || '(no id)'}</option>
              ))}
            </select>
            {(filterDate || filterMachine) && (
              <button
                type="button"
                onClick={() => {
                  setFilterDate('');
                  setFilterMachine('');
                  setPage(1);
                }}
                className="hmi32-filter-clear"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {paginated.length === 0 ? (
          <p className="hmi32-empty-msg hmi32-empty-msg--pad">No sessions found for selected filters.</p>
        ) : (
          <>
            <div className="hmi32-table-scroll">
              <table className="hmi32-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Start</th>
                    <th>Stop</th>
                    <th>Duration</th>
                    <th>Machine</th>
                    <th>Synced</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((s, i) => (
                    <tr key={i}>
                      <td className="hmi32-table__muted">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td>{s.date}</td>
                      <td>{s.start_time || s.start || '-'}</td>
                      <td>
                        {s.stop_time || s.stop ? (
                          s.stop_time || s.stop
                        ) : (
                          <span className="hmi32-side__badge">Running</span>
                        )}
                      </td>
                      <td className="hmi32-table__mid">
                        {s.total_running_time_formatted || fmtDuration(s.total_running_time || s.duration_sec || 0)}
                      </td>
                      <td className="hmi32-table__muted">{s.machine_id || '-'}</td>
                      <td>
                        {s.synced ? (
                          <span className="hmi32-pin hmi32-pin--on">Synced</span>
                        ) : (
                          <span className="hmi32-pin">Local</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="hmi32-pagination">
                <span>
                  Page {page} of {totalPages} — {filtered.length} sessions
                </span>
                <div className="hmi32-pagination__btns">
                  <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    Prev
                  </button>
                  <button type="button" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default ReportsPage;
