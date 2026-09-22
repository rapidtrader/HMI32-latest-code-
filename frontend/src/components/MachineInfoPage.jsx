import { useQueryClient } from '@tanstack/react-query';
import { useMachineInfo } from '../hooks/useHmi32Queries';
import PageLayout from './PageLayout';

const isOnline = (updatedAt) => {
  if (!updatedAt) return false;
  return Date.now() - new Date(updatedAt).getTime() < 5 * 60 * 1000;
};

const InfoSection = ({ title, tone, children }) => (
  <div className="hmi32-info-section">
    <div className={`hmi32-side__head hmi32-side__head--${tone}`}>{title}</div>
    <div className="hmi32-info-section__body">{children}</div>
  </div>
);

const InfoRow = ({ label, value, highlight = false }) => (
  <div className={`hmi32-info-row ${highlight ? 'hmi32-info-row--highlight' : ''}`}>
    <span>{label}</span>
    <strong>{value ?? '-'}</strong>
  </div>
);

const MachineCard = ({ mid, live, db }) => {
  const state = live?.state || {};
  const gps = live?.gps || {};
  const online = isOnline(live?.updated_at);

  return (
    <div className="hmi32-card hmi32-info-card">
      <div className="hmi32-banner hmi32-banner--compact">
        <div>
          <p className="hmi32-banner__lbl">Machine ID</p>
          <p className="hmi32-banner__id">{mid}</p>
        </div>
        <div className="hmi32-banner__right">
          <span className={`hmi32-status-pill ${online ? 'hmi32-status-pill--on' : ''}`}>
            {online ? 'Online' : 'Offline'}
          </span>
          <p className="hmi32-banner__event">{live?.lastEvent || 'No recent events'}</p>
        </div>
      </div>

      <div className="hmi32-info-card__body">
        <InfoSection title="Identity" tone="blue">
          <InfoRow label="Machine ID" value={mid} highlight />
          <InfoRow label="Client Name" value={db?.clientName || state?.clientName} />
          <InfoRow label="Location" value={db?.location || state?.location} />
          <InfoRow label="Vehicle Plate" value={db?.vehiclePlateNo || state?.vehiclePlateNo} highlight />
        </InfoSection>

        {live && (
          <InfoSection title="Live Status" tone="green">
            <InfoRow
              label="Last Updated"
              value={live.updated_at ? new Date(live.updated_at).toLocaleString() : '-'}
            />
            <InfoRow label="Last Event" value={live.lastEvent} />
            {(gps.lat != null || gps.latitude != null) && (
              <InfoRow
                label="GPS"
                value={`${Number(gps.lat ?? gps.latitude).toFixed(5)}, ${Number(gps.lng ?? gps.longitude).toFixed(5)}`}
              />
            )}
            {gps.speed != null && <InfoRow label="Speed" value={`${gps.speed} km/h`} />}
          </InfoSection>
        )}

        {db?.updated_at && (
          <InfoSection title="Database" tone="purple">
            <InfoRow label="Last Saved" value={new Date(db.updated_at).toLocaleString()} />
          </InfoSection>
        )}
      </div>
    </div>
  );
};

const MachineInfoPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useMachineInfo();

  const machines = data?.machines || [];
  const dbInfos = data?.dbInfos || [];

  const allMachineIds = [
    ...new Set([...machines.map((m) => m.machineId), ...dbInfos.map((d) => d.machineId)]),
  ];

  const onlineCount = allMachineIds.filter((mid) => {
    const live = machines.find((m) => m.machineId === mid);
    return isOnline(live?.updated_at);
  }).length;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['hmi32', 'machine-info'] });
  };

  return (
    <PageLayout
      title="Machine Info"
      subtitle="Identity & status of connected machines"
      loading={isLoading}
      loadingText="Loading Machine Info..."
      error={error}
      onRefresh={refresh}
    >
      {allMachineIds.length === 0 && !error ? (
        <div className="hmi32-card hmi32-empty-box">
          <p>No machine data available.</p>
          <span>Register a machine on the Pi to see info here.</span>
        </div>
      ) : (
        <>
          <div className="hmi32-stats hmi32-stats--3">
            <div className="hmi32-stat">
              <div className="hmi32-stat__icon hmi32-stat__icon--blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <div>
                <p className="hmi32-stat__label">Total Machines</p>
                <p className="hmi32-stat__value">{allMachineIds.length}</p>
              </div>
            </div>
            <div className="hmi32-stat">
              <div className="hmi32-stat__icon hmi32-stat__icon--green">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="hmi32-stat__label">Online Now</p>
                <p className="hmi32-stat__value">{onlineCount}</p>
                <p className="hmi32-stat__sub">Active in last 5 min</p>
              </div>
            </div>
            <div className="hmi32-stat">
              <div className="hmi32-stat__icon hmi32-stat__icon--purple">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
                  <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
                </svg>
              </div>
              <div>
                <p className="hmi32-stat__label">Registered in DB</p>
                <p className="hmi32-stat__value">{dbInfos.length}</p>
              </div>
            </div>
          </div>

          <div className="hmi32-info-grid">
            {allMachineIds.map((mid) => (
              <MachineCard
                key={mid}
                mid={mid}
                live={machines.find((m) => m.machineId === mid)}
                db={dbInfos.find((d) => d.machineId === mid)}
              />
            ))}
          </div>
        </>
      )}
    </PageLayout>
  );
};

export default MachineInfoPage;
