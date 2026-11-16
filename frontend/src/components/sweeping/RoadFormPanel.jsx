import { useEffect, useMemo, useState } from 'react';
import RoadRouteMap from './RoadRouteMap';
import { pathLengthKm } from '../../utils/geo';
import { suggestSweepingRoadId } from '../../api/sweepingRoads';

const FREQUENCIES = ['Daily', 'Weekly', 'Bi-Weekly', 'Monthly'];

const RoadFormPanel = ({
  mode,
  initial,
  projects,
  machines,
  saving,
  error,
  onCancel,
  onSave,
}) => {
  const readOnly = mode === 'view';
  const isEdit = mode === 'edit';

  const [assignedProjectId, setAssignedProjectId] = useState('');
  const [roadId, setRoadId] = useState('');
  const [roadName, setRoadName] = useState('');
  const [areaName, setAreaName] = useState('');
  const [colonyName, setColonyName] = useState('');
  const [frequency, setFrequency] = useState('Daily');
  const [assignedMachineId, setAssignedMachineId] = useState('');
  const [status, setStatus] = useState('Active');
  const [gpsPoints, setGpsPoints] = useState([]);
  const [previewOn, setPreviewOn] = useState(true);
  const [mapClickOn, setMapClickOn] = useState(true);

  useEffect(() => {
    if (initial) {
      setAssignedProjectId(initial.assignedProjectId ?? '');
      setRoadId(initial.roadId ?? '');
      setRoadName(initial.roadName ?? '');
      setAreaName(initial.areaName ?? '');
      setColonyName(initial.colonyName ?? '');
      setFrequency(initial.frequency ?? 'Daily');
      setAssignedMachineId(initial.assignedMachineId ?? '');
      setStatus(initial.status ?? 'Active');
      setGpsPoints(Array.isArray(initial.gpsPoints) ? initial.gpsPoints : []);
    } else {
      setAssignedProjectId('');
      setRoadId('');
      setRoadName('');
      setAreaName('');
      setColonyName('');
      setFrequency('Daily');
      setAssignedMachineId('');
      setStatus('Active');
      setGpsPoints([]);
    }
  }, [initial, mode]);

  useEffect(() => {
    if (readOnly || isEdit || !assignedProjectId) return;
    let cancelled = false;
    suggestSweepingRoadId(assignedProjectId)
      .then((id) => {
        if (!cancelled) setRoadId(id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [assignedProjectId, readOnly, isEdit]);

  const projectMachines = useMemo(
    () => machines.filter((m) => m.assignedProjectId === assignedProjectId && m.status === 'Active'),
    [machines, assignedProjectId],
  );

  const lengthKm = useMemo(() => pathLengthKm(gpsPoints), [gpsPoints]);
  const lengthLabel =
    gpsPoints.length >= 2 ? `${lengthKm} KM` : 'Add ≥ 2 GPS points';

  const title = mode === 'view' ? 'View Road' : mode === 'edit' ? 'Edit Road' : 'Add Road';
  const subtitle =
    mode === 'view' ? 'Road segment and GPS route' : 'Define road details and map route';

  const addPoint = ({ lat, lng }) => {
    if (readOnly || !mapClickOn) return;
    setGpsPoints((pts) => [...pts, { lat, lng, order: pts.length }]);
  };

  const addManualPoint = () => {
    const lat = Number(window.prompt('Latitude', '28.594'));
    const lng = Number(window.prompt('Longitude', '77.0255'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setGpsPoints((pts) => [...pts, { lat, lng, order: pts.length }]);
  };

  const removePoint = (idx) => {
    setGpsPoints((pts) =>
      pts.filter((_, i) => i !== idx).map((p, i) => ({ ...p, order: i })),
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (readOnly) return;
    const proj = projects.find((p) => p.projectId === assignedProjectId);
    onSave({
      roadId,
      roadName: roadName.trim(),
      assignedProjectId,
      assignedProjectName: proj?.projectName || '',
      areaName: areaName.trim(),
      colonyName: colonyName.trim(),
      frequency,
      assignedMachineId,
      status,
      gpsPoints,
    });
  };

  return (
    <div className="sweep-machine-form">
      <div className="sweep-machine-form__head">
        <button type="button" className="sweep-machine-form__back" onClick={onCancel} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="sweep-machine-form__card">
          <div className="sweep-machine-form__card-head">Road Details</div>
          <div className="sweep-machine-form__card-body">
            {error && <p className="sweep-modal__error">{error}</p>}

            <label className="sweep-field">
              <span>
                Project <em className="sweep-req">*</em>
              </span>
              <select
                value={assignedProjectId}
                disabled={readOnly || isEdit}
                required
                onChange={(e) => {
                  setAssignedProjectId(e.target.value);
                  setAssignedMachineId('');
                }}
              >
                <option value="">— Select Project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.projectId}>
                    {p.projectName}
                  </option>
                ))}
              </select>
            </label>

            <div className="sweep-field-row">
              <label className="sweep-field">
                <span>
                  Area Name <em className="sweep-req">*</em>
                </span>
                <input
                  type="text"
                  placeholder="e.g. Sector 10"
                  value={areaName}
                  disabled={readOnly}
                  required
                  onChange={(e) => setAreaName(e.target.value)}
                />
              </label>
              <label className="sweep-field">
                <span>
                  Colony Name <em className="sweep-req">*</em>
                </span>
                <input
                  type="text"
                  placeholder="e.g. ABC Colony"
                  value={colonyName}
                  disabled={readOnly}
                  required
                  onChange={(e) => setColonyName(e.target.value)}
                />
              </label>
            </div>

            <div className="sweep-field-row">
              <label className="sweep-field">
                <span>
                  Road Name <em className="sweep-req">*</em>
                </span>
                <input
                  type="text"
                  placeholder="e.g. Main Road"
                  value={roadName}
                  disabled={readOnly}
                  required
                  onChange={(e) => setRoadName(e.target.value)}
                />
              </label>
              <label className="sweep-field">
                <span>Road ID</span>
                <input type="text" value={roadId || 'Select a project first'} disabled readOnly />
                {!readOnly && (
                  <small className="sweep-hint">Select a project to auto-generate.</small>
                )}
              </label>
            </div>

            <div className="sweep-field-row">
              <label className="sweep-field">
                <span>Total Length</span>
                <div className="sweep-input-suffix">
                  <input type="text" value={lengthLabel} disabled readOnly />
                  <span>KM</span>
                </div>
                {!readOnly && (
                  <small className="sweep-hint">Will auto-fill when ≥ 2 GPS points are added.</small>
                )}
              </label>
              <label className="sweep-field">
                <span>Status</span>
                <select value={status} disabled={readOnly} onChange={(e) => setStatus(e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
            </div>

            <div className="sweep-field-row">
              <label className="sweep-field">
                <span>Assigned Machine</span>
                <select
                  value={assignedMachineId}
                  disabled={readOnly || !assignedProjectId}
                  onChange={(e) => setAssignedMachineId(e.target.value)}
                >
                  <option value="">
                    {assignedProjectId ? '— Select Machine —' : 'Select a project first'}
                  </option>
                  {projectMachines.map((m) => (
                    <option key={m.id} value={m.machineId}>
                      {m.machineId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sweep-field">
                <span>Sweeping Frequency</span>
                <select
                  value={frequency}
                  disabled={readOnly}
                  onChange={(e) => setFrequency(e.target.value)}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="sweep-machine-form__card" style={{ marginTop: '1rem' }}>
          <div className="sweep-machine-form__card-head sweep-road-map__head">
            <span>GPS Route Points</span>
            {!readOnly && (
              <div className="sweep-road-map__toggles">
                <button
                  type="button"
                  className={`sweep-toggle ${previewOn ? 'sweep-toggle--on' : ''}`}
                  onClick={() => setPreviewOn((v) => !v)}
                >
                  ~ Preview {previewOn ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  className={`sweep-toggle sweep-toggle--green ${mapClickOn ? 'sweep-toggle--on' : ''}`}
                  onClick={() => setMapClickOn((v) => !v)}
                >
                  ● Map Click {mapClickOn ? 'ON' : 'OFF'}
                </button>
              </div>
            )}
          </div>
          <div className="sweep-road-map__body">
            <RoadRouteMap
              points={gpsPoints}
              previewOn={previewOn}
              mapClickOn={!readOnly && mapClickOn}
              readOnly={readOnly}
              onMapClick={addPoint}
            />

            {gpsPoints.length === 0 ? (
              <p className="sweep-road-points-empty">
                No GPS points yet. Click on the map above or use the button below.
              </p>
            ) : (
              <ul className="sweep-road-points-list">
                {gpsPoints.map((p, idx) => (
                  <li key={`${p.lat}-${p.lng}-${idx}`}>
                    <span>
                      {idx + 1}. {Number(p.lat).toFixed(6)}, {Number(p.lng).toFixed(6)}
                    </span>
                    {!readOnly && (
                      <button type="button" className="sweep-link sweep-link--red" onClick={() => removePoint(idx)}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!readOnly && (
              <button type="button" className="hmi32-btn hmi32-btn--ghost sweep-add-gps" onClick={addManualPoint}>
                + Add GPS Point
              </button>
            )}
          </div>
        </div>

        <div className="sweep-machine-form__foot">
          <button type="button" className="hmi32-btn hmi32-btn--ghost" onClick={onCancel}>
            {readOnly ? 'Back' : 'Cancel'}
          </button>
          {!readOnly && (
            <button type="submit" className="hmi32-btn sweep-btn--violet" disabled={saving}>
              {saving ? 'Saving…' : 'Save Road'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default RoadFormPanel;