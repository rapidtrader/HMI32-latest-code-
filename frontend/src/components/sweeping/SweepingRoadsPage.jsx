import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '../PageLayout';
import RoadFormPanel from './RoadFormPanel';
import { fetchSweepingProjects } from '../../api/sweepingProjects';
import { fetchSweepingMachines } from '../../api/sweepingMachines';
import {
  createSweepingRoad,
  deactivateSweepingRoad,
  fetchSweepingRoadFilterOptions,
  fetchSweepingRoads,
  updateSweepingRoad,
} from '../../api/sweepingRoads';

const PAGE_SIZE = 10;
const LIST_KEY = ['sweeping', 'roads'];
const PROJECTS_KEY = ['sweeping', 'projects', 'all'];
const MACHINES_KEY = ['sweeping', 'machines', 'all'];
const FILTER_KEY = ['sweeping', 'roads', 'filters'];

const statusClass = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'sweep-badge sweep-badge--active';
  return 'sweep-badge sweep-badge--inactive';
};

const SweepingRoadsPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [colonyFilter, setColonyFilter] = useState('all');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [screen, setScreen] = useState({ view: 'list', mode: 'add', row: null });
  const [saveError, setSaveError] = useState('');

  const projectsQuery = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () => fetchSweepingProjects({ limit: 200, page: 1 }),
  });
  const projects = projectsQuery.data?.rows ?? [];

  const machinesQuery = useQuery({
    queryKey: MACHINES_KEY,
    queryFn: () => fetchSweepingMachines({ limit: 500, page: 1 }),
  });
  const machines = machinesQuery.data?.rows ?? [];

  const filterOptionsQuery = useQuery({
    queryKey: FILTER_KEY,
    queryFn: fetchSweepingRoadFilterOptions,
  });
  const filterOptions = filterOptionsQuery.data ?? { areas: [], colonies: [], frequencies: [] };

  const listQuery = useQuery({
    queryKey: [
      ...LIST_KEY,
      search,
      statusFilter,
      projectFilter,
      areaFilter,
      colonyFilter,
      frequencyFilter,
      page,
    ],
    queryFn: () =>
      fetchSweepingRoads({
        search,
        status: statusFilter,
        projectId: projectFilter,
        area: areaFilter,
        colony: colonyFilter,
        frequency: frequencyFilter,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: screen.view === 'list',
  });

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: LIST_KEY });
    queryClient.invalidateQueries({ queryKey: FILTER_KEY });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (screen.mode === 'edit' && screen.row?.id) {
        return updateSweepingRoad(screen.row.id, payload);
      }
      return createSweepingRoad(payload);
    },
    onSuccess: () => {
      setSaveError('');
      setScreen({ view: 'list', mode: 'add', row: null });
      refresh();
    },
    onError: (err) => setSaveError(err.message || 'Save failed'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => deactivateSweepingRoad(id),
    onSuccess: () => refresh(),
  });

  const assignMachineMutation = useMutation({
    mutationFn: ({ roadId, machineId }) => updateSweepingRoad(roadId, { assignedMachineId: machineId }),
    onSuccess: () => refresh(),
  });

  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const machinesForProject = (projectId) =>
    machines.filter((m) => m.assignedProjectId === projectId);

  const handleDeactivate = (row) => {
    const ok = window.confirm(`Deactivate road "${row.roadName}" (${row.roadId})?`);
    if (!ok) return;
    deactivateMutation.mutate(row.id);
  };

  if (screen.view === 'form') {
    return (
      <PageLayout title="Roads" subtitle="Road segments and sweep routes">
        <RoadFormPanel
          mode={screen.mode}
          initial={screen.row}
          projects={projects}
          machines={machines}
          saving={saveMutation.isPending}
          error={saveError}
          onCancel={() => {
            setSaveError('');
            setScreen({ view: 'list', mode: 'add', row: null });
          }}
          onSave={(payload) => saveMutation.mutate(payload)}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Roads"
      subtitle="Road segments and sweep routes"
      loading={listQuery.isLoading && !listQuery.data}
      error={listQuery.error}
      onRefresh={refresh}
    >
      <div className="sweep-projects sweep-roads">
        <div className="sweep-projects__toolbar sweep-roads__toolbar">
          <form className="sweep-projects__search" onSubmit={handleSearchSubmit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search road..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>

          <div className="sweep-projects__actions sweep-roads__filters">
            <select
              className="hmi32-select sweep-filter-select"
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.projectId}>
                  {p.projectName}
                </option>
              ))}
            </select>

            <select
              className="hmi32-select sweep-filter-select"
              value={areaFilter}
              onChange={(e) => {
                setAreaFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Areas</option>
              {filterOptions.areas?.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <select
              className="hmi32-select sweep-filter-select"
              value={colonyFilter}
              onChange={(e) => {
                setColonyFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Colonies</option>
              {filterOptions.colonies?.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              className="hmi32-select sweep-filter-select"
              value={frequencyFilter}
              onChange={(e) => {
                setFrequencyFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Frequencies</option>
              {(filterOptions.frequencies || ['Daily', 'Weekly', 'Bi-Weekly', 'Monthly']).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>

            <select
              className="hmi32-select sweep-filter-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>

            <button
              type="button"
              className="hmi32-btn hmi32-btn--ghost sweep-projects__refresh"
              onClick={refresh}
              disabled={listQuery.isFetching}
            >
              Refresh
            </button>

            <button
              type="button"
              className="hmi32-btn sweep-btn--violet"
              onClick={() => {
                setSaveError('');
                setScreen({ view: 'form', mode: 'add', row: null });
              }}
            >
              + Add Road
            </button>
          </div>
        </div>

        <div className="hmi32-card sweep-projects__card">
          {rows.length === 0 ? (
            <p className="hmi32-empty-msg hmi32-empty-msg--pad">No roads found.</p>
          ) : (
            <div className="hmi32-table-scroll">
              <table className="hmi32-table sweep-table sweep-roads-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Road ID</th>
                    <th>Road Name</th>
                    <th>Project</th>
                    <th>Area</th>
                    <th>Colony</th>
                    <th>Length</th>
                    <th>Frequency</th>
                    <th>Machine</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id}>
                      <td className="hmi32-table__muted">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="hmi32-table__mid">{row.roadId}</td>
                      <td>{row.roadName}</td>
                      <td>{row.assignedProjectName || row.assignedProjectId}</td>
                      <td>{row.areaName}</td>
                      <td>{row.colonyName}</td>
                      <td>{row.lengthKm} KM</td>
                      <td>
                        <span className="sweep-freq-pill">{row.frequency}</span>
                      </td>
                      <td>
                        <select
                          className="hmi32-select sweep-inline-machine"
                          value={row.assignedMachineId || ''}
                          disabled={assignMachineMutation.isPending}
                          onChange={(e) =>
                            assignMachineMutation.mutate({
                              roadId: row.id,
                              machineId: e.target.value,
                            })
                          }
                        >
                          <option value="">—</option>
                          {machinesForProject(row.assignedProjectId).map((m) => (
                            <option key={m.id} value={m.machineId}>
                              {m.machineId}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={`${statusClass(row.status)} sweep-badge--with-dot`}>
                          {row.status}
                        </span>
                      </td>
                      <td>
                        <div className="sweep-row-actions">
                          <button
                            type="button"
                            className="sweep-link sweep-link--violet"
                            onClick={() => {
                              setSaveError('');
                              setScreen({ view: 'form', mode: 'view', row });
                            }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="sweep-link sweep-link--blue"
                            onClick={() => {
                              setSaveError('');
                              setScreen({ view: 'form', mode: 'edit', row });
                            }}
                          >
                            Edit
                          </button>
                          {row.status === 'Active' && (
                            <button
                              type="button"
                              className="sweep-link sweep-link--amber"
                              onClick={() => handleDeactivate(row)}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="sweep-projects__pager">
            <span>
              Showing {showingFrom}-{showingTo} of {total}
            </span>
            <div className="sweep-projects__pager-btns">
              <button
                type="button"
                className="hmi32-btn hmi32-btn--ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </button>
              <span>
                {page}/{totalPages}
              </span>
              <button
                type="button"
                className="hmi32-btn hmi32-btn--ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default SweepingRoadsPage;