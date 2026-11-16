import { useEffect, useMemo, useState } from 'react';

const EMPTY = {
  machineId: '',
  vehicleNumber: '',
  machineName: '',
  assignedProjectId: '',
  sweepingKmPerDay: '',
  status: 'Active',
  workStartTime: '08:00',
  workEndTime: '17:00',
};

const MachineFormPanel = ({
  mode,
  initial,
  projects,
  vehicleOptions,
  saving,
  error,
  onCancel,
  onSave,
}) => {
  const readOnly = mode === 'view';
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (initial) {
      setForm({
        machineId: initial.machineId ?? '',
        vehicleNumber: initial.vehicleNumber ?? '',
        machineName: initial.machineName ?? '',
        assignedProjectId: initial.assignedProjectId ?? '',
        sweepingKmPerDay:
          initial.sweepingKmPerDay != null ? String(initial.sweepingKmPerDay) : '',
        status: initial.status ?? 'Active',
        workStartTime: initial.workStartTime ?? '08:00',
        workEndTime: initial.workEndTime ?? '17:00',
      });
    } else {
      setForm(EMPTY);
    }
  }, [initial]);

  const title = mode === 'view' ? 'View Machine' : mode === 'edit' ? 'Edit Machine' : 'Add Machine';
  const subtitle =
    mode === 'view'
      ? 'Sweeping machine details'
      : mode === 'edit'
        ? 'Update sweeping machine'
        : 'Create a new sweeping machine';

  const projectName = useMemo(() => {
    const p = projects.find((x) => x.projectId === form.assignedProjectId);
    return p?.projectName || initial?.assignedProjectName || '';
  }, [form.assignedProjectId, projects, initial]);

  const handleMachineIdChange = (machineId) => {
    const opt = vehicleOptions.find((o) => o.machineId === machineId);
    setForm((f) => ({
      ...f,
      machineId,
      vehicleNumber: f.vehicleNumber || opt?.vehiclePlateNo || '',
      machineName: f.machineName || machineId,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (readOnly) return;
    const proj = projects.find((p) => p.projectId === form.assignedProjectId);
    onSave({
      machineId: form.machineId.trim(),
      vehicleNumber: form.vehicleNumber.trim(),
      machineName: form.machineName.trim(),
      assignedProjectId: form.assignedProjectId,
      assignedProjectName: proj?.projectName || '',
      sweepingKmPerDay: Number(form.sweepingKmPerDay) || 0,
      status: form.status,
      workStartTime: form.workStartTime,
      workEndTime: form.workEndTime,
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
          <div className="sweep-machine-form__card-head">Machine Details</div>
          <div className="sweep-machine-form__card-body">
            {error && <p className="sweep-modal__error">{error}</p>}

            <div className="sweep-field-row">
              <label className="sweep-field">
                <span>
                  Machine ID <em className="sweep-req">*</em>
                </span>
                <select
                  value={form.machineId}
                  disabled={readOnly || mode === 'edit'}
                  required
                  onChange={(e) => handleMachineIdChange(e.target.value)}
                >
                  <option value="">— Select Vehicle ID —</option>
                  {vehicleOptions.map((o) => (
                    <option key={o.machineId} value={o.machineId}>
                      {o.machineId}
                    </option>
                  ))}
                  {form.machineId &&
                    !vehicleOptions.some((o) => o.machineId === form.machineId) && (
                      <option value={form.machineId}>{form.machineId}</option>
                    )}
                </select>
              </label>

              <label className="sweep-field">
                <span>Vehicle Number</span>
                <input
                  type="text"
                  placeholder="e.g. DL01AB1234"
                  value={form.vehicleNumber}
                  disabled={readOnly}
                  onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
                />
              </label>
            </div>

            <label className="sweep-field">
              <span>
                Machine Name <em className="sweep-req">*</em>
              </span>
              <input
                type="text"
                placeholder="e.g. Sweeper Machine 01"
                value={form.machineName}
                disabled={readOnly}
                required
                onChange={(e) => setForm((f) => ({ ...f, machineName: e.target.value }))}
              />
            </label>

            <label className="sweep-field">
              <span>Project</span>
              {readOnly ? (
                <input type="text" disabled value={projectName || form.assignedProjectId || '—'} />
              ) : (
                <select
                  value={form.assignedProjectId}
                  onChange={(e) => setForm((f) => ({ ...f, assignedProjectId: e.target.value }))}
                >
                  <option value="">— Select Project —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.projectId}>
                      {p.projectName}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <div className="sweep-field-row">
              <label className="sweep-field">
                <span>Sweeping KM/Day</span>
                <div className="sweep-input-suffix">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 80"
                    value={form.sweepingKmPerDay}
                    disabled={readOnly}
                    onChange={(e) => setForm((f) => ({ ...f, sweepingKmPerDay: e.target.value }))}
                  />
                  <span>KM/day</span>
                </div>
                {!readOnly && (
                  <small className="sweep-hint">Used for future Daily Plan capacity validation.</small>
                )}
              </label>

              <label className="sweep-field">
                <span>Status</span>
                <select
                  value={form.status}
                  disabled={readOnly}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
            </div>

            <label className="sweep-field">
              <span>Working Hours</span>
              <div className="sweep-field-row sweep-field-row--time">
                <input
                  type="time"
                  value={form.workStartTime}
                  disabled={readOnly}
                  onChange={(e) => setForm((f) => ({ ...f, workStartTime: e.target.value }))}
                />
                <input
                  type="time"
                  value={form.workEndTime}
                  disabled={readOnly}
                  onChange={(e) => setForm((f) => ({ ...f, workEndTime: e.target.value }))}
                />
              </div>
              {!readOnly && (
                <small className="sweep-hint">24-hour format. End time must be after start time.</small>
              )}
            </label>
          </div>
        </div>

        <div className="sweep-machine-form__foot">
          <button type="button" className="hmi32-btn hmi32-btn--ghost" onClick={onCancel}>
            {readOnly ? 'Back' : 'Cancel'}
          </button>
          {!readOnly && (
            <button type="submit" className="hmi32-btn sweep-btn--violet" disabled={saving}>
              {saving ? 'Saving…' : 'Save Machine'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default MachineFormPanel;