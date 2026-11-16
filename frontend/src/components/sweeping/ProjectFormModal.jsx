import { useEffect, useState } from 'react';

const EMPTY = {
  projectId: '',
  projectName: '',
  status: 'Active',
  speedLimitKmh: '8',
  completionPct: '0',
};

const ProjectFormModal = ({ open, mode, initial, onClose, onSave, saving, error }) => {
  const readOnly = mode === 'view';
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        projectId: initial.projectId ?? '',
        projectName: initial.projectName ?? '',
        status: initial.status ?? 'Active',
        speedLimitKmh: String(initial.speedLimitKmh ?? 0),
        completionPct: String(initial.completionPct ?? 0),
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, initial]);

  if (!open) return null;

  const title =
    mode === 'view' ? 'View Project' : mode === 'edit' ? 'Edit Project' : 'Add Project';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (readOnly) return;
    onSave({
      projectId: form.projectId.trim(),
      projectName: form.projectName.trim(),
      status: form.status,
      speedLimitKmh: Number(form.speedLimitKmh) || 0,
      completionPct: Number(form.completionPct) || 0,
    });
  };

  return (
    <div className="sweep-modal" role="dialog" aria-modal="true" aria-labelledby="sweep-modal-title">
      <button type="button" className="sweep-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div className="sweep-modal__panel">
        <div className="sweep-modal__head">
          <h2 id="sweep-modal-title">{title}</h2>
          <button type="button" className="sweep-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form className="sweep-modal__body" onSubmit={handleSubmit}>
          {error && <p className="sweep-modal__error">{error}</p>}

          <label className="sweep-field">
            <span>
              Project ID <em className="sweep-req">*</em>
            </span>
            <input
              type="text"
              placeholder="e.g. PRJ-001"
              value={form.projectId}
              disabled={readOnly}
              required
              onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
            />
          </label>

          <label className="sweep-field">
            <span>
              Project Name <em className="sweep-req">*</em>
            </span>
            <input
              type="text"
              placeholder="e.g. Delhi Road Sweeping"
              value={form.projectName}
              disabled={readOnly}
              required
              onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))}
            />
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
              <option value="Completed">Completed</option>
            </select>
          </label>

          <div className="sweep-field-row">
            <label className="sweep-field">
              <span>Speed Limit</span>
              <div className="sweep-input-suffix">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.speedLimitKmh}
                  disabled={readOnly}
                  onChange={(e) => setForm((f) => ({ ...f, speedLimitKmh: e.target.value }))}
                />
                <span>KM/H</span>
              </div>
            </label>

            <label className="sweep-field">
              <span>Completion %</span>
              <div className="sweep-input-suffix">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={form.completionPct}
                  disabled={readOnly}
                  onChange={(e) => setForm((f) => ({ ...f, completionPct: e.target.value }))}
                />
                <span>%</span>
              </div>
            </label>
          </div>

          <div className="sweep-modal__foot">
            <button type="button" className="hmi32-btn hmi32-btn--ghost" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button type="submit" className="hmi32-btn sweep-btn--violet" disabled={saving}>
                {saving ? 'Saving…' : 'Save Project'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectFormModal;