import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '../PageLayout';
import { fetchSweepingProjects } from '../../api/sweepingProjects';
import {
  cancelMachineDailyPlan,
  fetchDailyPlan,
  generateDailyPlan,
} from '../../api/sweepingDailyPlans';

const PROJECTS_KEY = ['sweeping', 'projects', 'all'];
const planKey = (projectId, date) => ['sweeping', 'daily-plan', projectId, date];

const todayIso = () => new Date().toISOString().slice(0, 10);

const fmtPlanTitleDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

const StatCard = ({ label, value, tone }) => (
  <div className={`sweep-plan-stat sweep-plan-stat--${tone || 'default'}`}>
    <p className="sweep-plan-stat__label">{label}</p>
    <p className="sweep-plan-stat__value">{value}</p>
  </div>
);

const MachinePlanCard = ({ machine, onCancelMachine }) => {
  const cap = Number(machine.capacityKm) || 0;
  const assigned = Number(machine.assignedKm) || 0;
  const pct = cap > 0 ? Math.min(100, (assigned / cap) * 100) : 0;
  const barTone = machine.withinCapacity ? 'ok' : 'warn';

  return (
    <div className="sweep-machine-plan">
      <div className="sweep-machine-plan__head">
        <div>
          <strong>
            {machine.machineId} — {machine.machineName}
          </strong>
          {machine.vehicleNumber ? <span className="sweep-machine-plan__plate"> ({machine.vehicleNumber})</span> : null}
        </div>
        <div className="sweep-machine-plan__head-actions">
          <span className="sweep-badge sweep-badge--active">Planned</span>
          <button type="button" className="hmi32-btn hmi32-btn--ghost sweep-machine-plan__edit" disabled title="Coming soon">
            Edit
          </button>
        </div>
      </div>

      <div className="sweep-machine-plan__capacity">
        <div className="sweep-machine-plan__capacity-labels">
          <span>Capacity {cap} KM</span>
          <span>
            Assigned <strong>{assigned}</strong> KM
          </span>
          <span>Remaining {machine.remainingKm} KM</span>
        </div>
        <div className="sweep-capacity-bar">
          <div className={`sweep-capacity-bar__fill sweep-capacity-bar__fill--${barTone}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`sweep-capacity-pill sweep-capacity-pill--${barTone}`}>
          {machine.withinCapacity ? '✓ Within Capacity' : '⚠ Over Capacity'}
        </span>
      </div>

      <div className="hmi32-table-scroll">
        <table className="hmi32-table sweep-table sweep-plan-roads-table">
          <thead>
            <tr>
              <th>Seq</th>
              <th>Road</th>
              <th>Area/Colony</th>
              <th>Planned KM</th>
            </tr>
          </thead>
          <tbody>
            {(machine.roads || []).map((r) => (
              <tr key={`${r.roadId}-${r.seq}`}>
                <td>{r.seq}</td>
                <td>
                  <strong>{r.roadName}</strong>
                  <div className="hmi32-table__muted">{r.roadId}</div>
                </td>
                <td>
                  {r.areaName} / {r.colonyName}
                </td>
                <td className="hmi32-table__mid">{r.plannedKm} KM</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sweep-machine-plan__foot">
        <button
          type="button"
          className="sweep-link sweep-link--amber"
          onClick={() => onCancelMachine(machine.machineId)}
        >
          Cancel Plan
        </button>
      </div>
    </div>
  );
};

const SweepingDailyPlanPage = () => {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [planDate, setPlanDate] = useState(todayIso());
  const [toast, setToast] = useState('');

  const projectsQuery = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () => fetchSweepingProjects({ limit: 200, page: 1, status: 'Active' }),
  });
  const projects = projectsQuery.data?.rows ?? [];

  const planQuery = useQuery({
    queryKey: planKey(projectId, planDate),
    queryFn: async () => {
      const res = await fetchDailyPlan(projectId, planDate);
      return res.data || null;
    },
    enabled: Boolean(projectId && planDate),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateDailyPlan(projectId, planDate),
    onSuccess: (res) => {
      setToast(res.message || 'Daily sweeping plan generated successfully');
      queryClient.setQueryData(planKey(projectId, planDate), res.data);
      queryClient.invalidateQueries({ queryKey: planKey(projectId, planDate) });
    },
    onError: (err) => setToast(err.message || 'Generate failed'),
  });

  const cancelMachineMutation = useMutation({
    mutationFn: (machineId) => cancelMachineDailyPlan(planQuery.data.id, machineId),
    onSuccess: (res) => {
      queryClient.setQueryData(planKey(projectId, planDate), res.data);
      setToast('Machine plan cancelled');
    },
  });

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const plan = planQuery.data;
  const stats = plan?.stats || {};
  const machines = plan?.machines || [];

  const projectLabel = useMemo(() => {
    const p = projects.find((x) => x.projectId === projectId);
    return p ? `${p.projectName} (${p.projectId})` : '';
  }, [projects, projectId]);

  const handleCancelMachine = (machineId) => {
    const ok = window.confirm(`Remove ${machineId} from this day's plan?`);
    if (!ok) return;
    cancelMachineMutation.mutate(machineId);
  };

  return (
    <PageLayout
      title="Daily Sweeping Plan"
      subtitle="Auto-generate machine-wise road assignment for a selected project and date"
      loading={projectsQuery.isLoading && !projects.length}
      error={planQuery.error}
    >
      <div className="sweep-daily-plan">
        <div className="hmi32-card sweep-daily-plan__generate">
          <div className="sweep-machine-form__card-head">Generate Plan</div>
          <div className="sweep-daily-plan__generate-body">
            <label className="sweep-field sweep-daily-plan__field">
              <span>Project</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="hmi32-select"
              >
                <option value="">— Select Project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.projectId}>
                    {p.projectName} ({p.projectId})
                  </option>
                ))}
              </select>
            </label>

            <label className="sweep-field sweep-daily-plan__field">
              <span>Date</span>
              <input
                type="date"
                className="hmi32-select"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
              />
            </label>

            <button
              type="button"
              className="hmi32-btn sweep-btn--violet sweep-daily-plan__gen-btn"
              disabled={!projectId || !planDate || generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              ✨ Generate Daily Plan
            </button>
          </div>
        </div>

        {!projectId ? (
          <div className="sweep-daily-plan__empty">
            Select a project to view or generate its daily plan.
          </div>
        ) : planQuery.isFetching && !plan ? (
          <div className="sweep-daily-plan__empty">Loading plan…</div>
        ) : !plan ? (
          <div className="sweep-daily-plan__empty">
            {projectLabel ? (
              <>
                No plan for <strong>{fmtPlanTitleDate(planDate)}</strong> yet. Click <strong>Generate Daily Plan</strong>.
              </>
            ) : (
              'No plan data.'
            )}
          </div>
        ) : !machines.length ? (
          <div className="sweep-daily-plan__empty">
            Plan saved for <strong>{fmtPlanTitleDate(planDate)}</strong> but no roads were assigned — add active machines &
            roads (Daily frequency) for this project, then generate again.
            {stats.unassignedRoads > 0 ? (
              <p style={{ marginTop: '0.5rem' }}>
                Unassigned roads: <strong>{stats.unassignedRoads}</strong>
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="sweep-plan-stats">
              <StatCard label="Scheduled Roads" value={stats.scheduledRoads ?? 0} />
              <StatCard label="Total Planned KM" value={`${stats.totalPlannedKm ?? 0} KM`} tone="blue" />
              <StatCard label="Machines Used" value={stats.machinesUsed ?? 0} />
              <StatCard
                label="Capacity Warnings"
                value={stats.capacityWarnings ?? 0}
                tone={stats.capacityWarnings ? 'warn' : 'ok'}
              />
              <StatCard
                label="Unassigned Roads"
                value={stats.unassignedRoads ?? 0}
                tone={stats.unassignedRoads ? 'warn' : 'ok'}
              />
            </div>

            <h3 className="sweep-plan-section-title">
              Plans for {fmtPlanTitleDate(planDate)} ({machines.length} machine{machines.length === 1 ? '' : 's'})
            </h3>

            <div className="sweep-machine-plan-list">
              {machines.map((m) => (
                <MachinePlanCard key={m.machineId} machine={m} onCancelMachine={handleCancelMachine} />
              ))}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="sweep-toast sweep-toast--success" role="status">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast('')} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </PageLayout>
  );
};

export default SweepingDailyPlanPage;