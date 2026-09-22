import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useHmi32Latest, useHmi32History } from '../hooks/useHmi32Queries';

const fmtDuration = (sec) => {
  if (!sec || sec <= 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const CONTROL_ORDER = [
  'frontDown', 'frontUp', 'leftExtend', 'leftRetract', 'litter',
  'rearDown', 'rearUp', 'rightExtend', 'rightRetract', 'sweeping',
];

const ControlIcon = ({ name }) => {
  const cls = 'hmi32-ctrl-icon';
  const icons = {
    frontDown: <path d="M12 5v10M8 11l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />,
    frontUp: <path d="M12 19V9M8 13l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />,
    rearDown: <path d="M12 5v10M8 11l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />,
    rearUp: <path d="M12 19V9M8 13l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />,
    leftExtend: <path d="M19 12H9M13 8l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />,
    leftRetract: <path d="M5 12h10M11 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />,
    rightExtend: <path d="M5 12h10M11 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />,
    rightRetract: <path d="M19 12H9M13 8l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />,
    litter: <path d="M4 7h16M6 7l1 12h10l1-12M9 7V5h6v2" strokeLinecap="round" strokeLinejoin="round" />,
    sweeping: <path d="M4 14c2-2 4-2 6 0s4 2 6 0M6 10l2-2M12 10l2-2M18 10l2-2" strokeLinecap="round" strokeLinejoin="round" />,
  };
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      {icons[name] || <circle cx="12" cy="12" r="4" />}
    </svg>
  );
};

const isOnline = (updatedAt) => {
  if (!updatedAt) return false;
  return Date.now() - new Date(updatedAt).getTime() < 5 * 60 * 1000;
};

const countActiveSensors = (adc) => {
  if (!adc || typeof adc !== 'object') return 0;
  return Object.values(adc).filter((v) => v != null).length;
};

const getBooleanStates = (state) => {
  const entries = Object.entries(state || {}).filter(
    ([k, v]) => typeof v === 'boolean' && k !== 'buttonColors'
  );
  const orderMap = Object.fromEntries(CONTROL_ORDER.map((k, i) => [k, i]));
  return entries.sort(([a], [b]) => {
    const ia = orderMap[a] ?? 999;
    const ib = orderMap[b] ?? 999;
    return ia !== ib ? ia - ib : a.localeCompare(b);
  });
};

const ControlTile = ({ label, value }) => {
  const on = value === 1 || value === true;
  return (
    <div className={`hmi32-ctrl ${on ? 'hmi32-ctrl--on' : ''}`}>
      <div className="hmi32-ctrl__icon-wrap">
        <ControlIcon name={label} />
      </div>
      <span className="hmi32-ctrl__name">{label}</span>
      <span className={`hmi32-ctrl__pill ${on ? 'hmi32-ctrl__pill--on' : ''}`}>{on ? 'ON' : 'OFF'}</span>
    </div>
  );
};

const StatCard = ({ tone, icon, title, value, sub }) => (
  <div className="hmi32-stat">
    <div className={`hmi32-stat__icon hmi32-stat__icon--${tone}`}>{icon}</div>
    <div>
      <p className="hmi32-stat__label">{title}</p>
      <p className="hmi32-stat__value">{value}</p>
      {sub && <p className="hmi32-stat__sub">{sub}</p>}
    </div>
  </div>
);

const SidePanel = ({ title, tone, children }) => (
  <div className="hmi32-side">
    <div className={`hmi32-side__head hmi32-side__head--${tone}`}>{title}</div>
    <div className="hmi32-side__body">{children}</div>
  </div>
);

const SideRow = ({ label, value, badge }) => (
  <div className="hmi32-side__row">
    <span>{label}</span>
    {badge ? <span className="hmi32-side__badge">{value}</span> : <strong>{value ?? '-'}</strong>}
  </div>
);

const MachineView = ({ row, history }) => {
  const state = row.state || {};
  const adc = row.adc || {};
  const distance = row.distance || {};
  const runtime = row.runtime || {};
  const booleanStates = getBooleanStates(state);
  const online = isOnline(row.updated_at);
  const sensorCount = countActiveSensors(adc);
  const machineHistory = history.filter((h) => h.machineId === row.machineId);

  return (
    <>
      <div className="hmi32-banner">
        <div>
          <p className="hmi32-banner__lbl">Machine ID</p>
          <p className="hmi32-banner__id">{row.machineId || '-'}</p>
        </div>
        <div className="hmi32-banner__right">
          <p className="hmi32-banner__lbl">Last Updated</p>
          <p className="hmi32-banner__time">
            {row.updated_at ? new Date(row.updated_at).toLocaleString() : '-'}
          </p>
        </div>
      </div>

      <div className="hmi32-stats">
        <StatCard
          tone="blue"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h2l1.5-4.5L12 18l2.5-6.5L16 12h3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          title="Sensors"
          value={`${sensorCount} Active Sensor${sensorCount !== 1 ? 's' : ''}`}
        />
        <StatCard
          tone="green"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          title="System Status"
          value={online ? 'Online' : 'Offline'}
          sub={online ? 'Machine is running' : 'No recent data'}
        />
        <StatCard
          tone="purple"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" /></svg>}
          title="Uptime"
          value={fmtDuration(runtime.suctionSec)}
          sub="Total Suction"
        />
      </div>

      <div className="hmi32-grid">
        <div className="hmi32-card">
          <div className="hmi32-card__head">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="hmi32-card__head-icon">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" strokeLinecap="round" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" />
            </svg>
            <h2>Machine Controls</h2>
          </div>
          <div className="hmi32-ctrl-grid">
            {booleanStates.length > 0 ? (
              booleanStates.map(([k, v]) => <ControlTile key={k} label={k} value={v} />)
            ) : (
              <p className="hmi32-empty-msg">No control data yet</p>
            )}
          </div>
        </div>

        <div className="hmi32-side-stack">
          <SidePanel title="Sensors" tone="blue">
            {adc.suction != null && <SideRow label="Suction" value={adc.suction} />}
            {adc.pa0 != null && <SideRow label="PAD" value={adc.pa0} />}
            {adc.suction == null && adc.pa0 == null && <p className="hmi32-empty-msg">No sensor data</p>}
          </SidePanel>
          <SidePanel title="Distance" tone="green">
            {distance.cm != null && <SideRow label="Distance" value={`${distance.cm} cm`} />}
            {distance.a25Cm != null && <SideRow label="A25" value={`${distance.a25Cm} cm`} />}
            {distance.a25Status && <SideRow label="Status" value={distance.a25Status} badge />}
            {distance.cm == null && distance.a25Cm == null && !distance.a25Status && (
              <p className="hmi32-empty-msg">No distance data</p>
            )}
          </SidePanel>
          <SidePanel title="Runtime" tone="purple">
            <SideRow label="Total Suction" value={runtime.suctionSec != null ? fmtDuration(runtime.suctionSec) : '-'} />
          </SidePanel>
        </div>
      </div>

      <div className="hmi32-card hmi32-history">
        <div className="hmi32-card__head hmi32-card__head--split">
          <div className="hmi32-card__head-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="hmi32-card__head-icon">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
            </svg>
            <h2>State Change History (Last {Math.min(machineHistory.length, 24)})</h2>
          </div>
          <span className="hmi32-history__tag">Last 24 Hours</span>
        </div>

        {machineHistory.length > 0 ? (
          <div className="hmi32-table-scroll">
            <table className="hmi32-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Machine ID</th>
                  <th>All Pin States</th>
                </tr>
              </thead>
              <tbody>
                {[...machineHistory]
                  .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
                  .slice(0, 24)
                  .map((item, idx) => {
                  const allStates = getBooleanStates(item.state || {});
                  return (
                    <tr key={idx}>
                      <td>{item.updated_at ? new Date(item.updated_at).toLocaleString() : '-'}</td>
                      <td className="hmi32-table__mid">{item.machineId || '-'}</td>
                      <td>
                        <div className="hmi32-pins">
                          {allStates.map(([k, v]) => (
                            <span key={k} className={`hmi32-pin ${v ? 'hmi32-pin--on' : ''}`}>
                              {k} <b>{v ? '✓' : '✗'}</b>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hmi32-empty-msg hmi32-empty-msg--pad">No state changes recorded yet.</p>
        )}
      </div>
    </>
  );
};

const Hmi32Monitor = () => {
  const queryClient = useQueryClient();
  const { data: machines = [], isLoading, error } = useHmi32Latest();
  const { data: history = [] } = useHmi32History();
  const [activeIdx, setActiveIdx] = useState(0);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['hmi32', 'latest'] });
    queryClient.invalidateQueries({ queryKey: ['hmi32', 'history'] });
  };

  const activeMachine = machines[activeIdx] || machines[0];

  if (isLoading) {
    return (
      <div className="hmi32-page hmi32-page--loading">
        <div className="hmi32-spinner" />
        <p>Loading HMI32 Monitor...</p>
      </div>
    );
  }

  return (
    <div className="hmi32-page">
      <header className="hmi32-topbar">
        <div className="hmi32-topbar__left">
          <span className="hmi32-topbar__dot" />
          <div>
            <h1>HMI32 Monitor</h1>
            <p>Real-time machine state tracking</p>
          </div>
        </div>
        <div className="hmi32-topbar__right">
          <button type="button" className="hmi32-topbar__icon" aria-label="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="hmi32-topbar__icon" aria-label="Profile">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="4" />
              <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="hmi32-topbar__refresh" onClick={refresh}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v5h.6M20 20v-5h-.6M5 9a7 7 0 0112.8-2M19 15a7 7 0 01-12.8 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
        </div>
      </header>

      <div className="hmi32-body">
        {error && <div className="hmi32-alert">{error.message}</div>}

        {machines.length > 1 && (
          <div className="hmi32-tabs">
            {machines.map((m, idx) => (
              <button
                key={m._id || m.machineId}
                type="button"
                className={`hmi32-tab ${idx === activeIdx ? 'hmi32-tab--on' : ''}`}
                onClick={() => setActiveIdx(idx)}
              >
                {m.machineId}
              </button>
            ))}
          </div>
        )}

        {activeMachine ? (
          <MachineView row={activeMachine} history={history} />
        ) : (
          <div className="hmi32-card hmi32-empty-box">
            <p>No HMI32 data yet.</p>
            <span>Connect a machine to see live data here.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Hmi32Monitor;
