import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageLayout from '../PageLayout';
import { fetchSweepingProjects } from '../../api/sweepingProjects';
import { fetchDailyPlan } from '../../api/sweepingDailyPlans';
import { fetchPlanVsActual } from '../../api/sweepingPlanVsActual';
import PlanVsActualMap from './PlanVsActualMap';

const PROJECTS_KEY = ['sweeping', 'projects', 'all'];
const todayIso = () => new Date().toISOString().slice(0, 10);

const StatCard = ({ label, value, tone }) => (
  <div className={`sweep-plan-stat sweep-plan-stat--${tone || 'default'}`}>
    <p className="sweep-plan-stat__label">{label}</p>
    <p className="sweep-plan-stat__value">{value}</p>
  </div>
);

const roadStatusClass = (status) => {
  if (status === 'Completed') return 'sweep-badge sweep-badge--active';
  if (status === 'Partial') return 'sweep-badge sweep-badge--done';
  return 'sweep-badge sweep-badge--inactive';
};

const SweepingPlanVsActualPage = () => {
  const [projectId, setProjectId] = useState('');
  const [planDate, setPlanDate] = useState(todayIso());
  const [machineId, setMachineId] = useState('all');
  const [loaded, setLoaded] = useState(null);

  const projectsQuery = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () => fetchSweepingProjects({ limit: 200, page: 1, status: 'Active' }),
  });
  const projects = projectsQuery.data?.rows ?? [];

  const planPreviewQuery = useQuery({
    queryKey: ['sweeping', 'daily-plan', projectId, planDate, 'machines-only'],
    queryFn: async () => {
      const res = await fetchDailyPlan(projectId, planDate);
      return res.data;
    },
    enabled: Boolean(projectId && planDate),
  });

  const machineOptions = useMemo(() => {
    const list = planPreviewQuery.data?.machines || [];
    return list.map((m) => m.machineId);
  }, [planPreviewQuery.data]);

  const reportQuery = useQuery({
    queryKey: ['sweeping', 'plan-vs-actual', loaded?.projectId, loaded?.planDate, loaded?.machineId],
    queryFn: () =>
      fetchPlanVsActual({
        projectId: loaded.projectId,
        planDate: loaded.planDate,
        machineId: loaded.machineId,
      }),
    enabled: Boolean(loaded),
  });

  const report = reportQuery.data;

  const loadReport = () => {
    if (!projectId || !planDate) return;
    setLoaded({ projectId, planDate, machineId });
  };

  return (
    <PageLayout
      title="Planned vs Actual"
      subtitle="Compare daily sweeping plan against actual GPS route from gps_locations"
      loading={projectsQuery.isLoading && !projects.length}
      error={reportQuery.error}
    >
      <div className="sweep-pva">
        <div className="hmi32-card sweep-daily-plan__generate">
          <div className="sweep-machine-form__card-head">Select Plan</div>
          <div className="sweep-pva__filters">
            <label className="sweep-field sweep-daily-plan__field">
              <span>Project</span>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setMachineId('all');
                  setLoaded(null);
                }}
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
                onChange={(e) => {
                  setPlanDate(e.target.value);
                  setLoaded(null);
                }}
              />
            </label>

            <label className="sweep-field sweep-daily-plan__field">
              <span>Machine [optional]</span>
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="hmi32-select"
                disabled={!projectId}
              >
                <option value="all">All Machines</option>
                {machineOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="hmi32-btn sweep-btn--violet sweep-pva__load"
              disabled={!projectId || !planDate || reportQuery.isFetching}
              onClick={loadReport}
            >
              📊 Load Report
            </button>
          </div>
        </div>

        {!loaded ? (
          <div className="sweep-daily-plan__empty">
            Select a project and date to view the planned vs actual report.
          </div>
        ) : reportQuery.isFetching && !report ? (
          <div className="sweep-daily-plan__empty">Loading report…</div>
        ) : !report?.hasPlan ? (
          <div className="sweep-daily-plan__empty">{report?.message || 'No plan found.'}</div>
        ) : (
          <>
            <div className="sweep-plan-stats sweep-pva-stats">
              <StatCard label="Planned KM" value={`${report.summary.plannedKm} KM`} tone="blue" />
              <StatCard label="Actual KM" value={`${report.summary.actualKm} KM`} tone="ok" />
              <StatCard
                label="Variance"
                value={`${report.summary.varianceKm > 0 ? '+' : ''}${report.summary.varianceKm} KM`}
                tone={report.summary.varianceKm >= 0 ? 'ok' : 'warn'}
              />
              <StatCard label="Roads Planned" value={report.summary.roadsPlanned} />
              <StatCard label="Completed" value={report.summary.roadsCompleted} tone="ok" />
              <StatCard label="Partial / Missed" value={`${report.summary.roadsPartial} / ${report.summary.roadsMissed}`} tone="warn" />
            </div>

            {(report.machines || []).map((m) => (
              <div key={m.machineId} className="hmi32-card sweep-pva-machine">
                <div className="sweep-machine-plan__head">
                  <div>
                    <strong>
                      {m.machineId} — {m.machineName}
                    </strong>
                    {m.vehicleNumber ? ` (${m.vehicleNumber})` : ''}
                  </div>
                  <span className="sweep-pva-km">
                    Planned {m.plannedKm} KM · Actual {m.actualKm} KM · Δ {m.varianceKm} KM
                  </span>
                </div>

                <PlanVsActualMap plannedPolylines={m.plannedPolylines} actualTrack={m.actualTrack} />

                <div className="hmi32-table-scroll">
                  <table className="hmi32-table sweep-table sweep-pva-table">
                    <thead>
                      <tr>
                        <th>Road</th>
                        <th>Area / Colony</th>
                        <th>Planned KM</th>
                        <th>Coverage</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(m.plannedRoads || []).map((r) => (
                        <tr key={r.roadId}>
                          <td>
                            <strong>{r.roadName}</strong>
                            <div className="hmi32-table__muted">{r.roadId}</div>
                          </td>
                          <td>
                            {r.areaName} / {r.colonyName}
                          </td>
                          <td>{r.plannedKm} KM</td>
                          <td>{r.coveragePct}%</td>
                          <td>
                            <span className={roadStatusClass(r.status)}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default SweepingPlanVsActualPage;