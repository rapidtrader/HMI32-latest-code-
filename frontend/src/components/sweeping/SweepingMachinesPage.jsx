import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '../PageLayout';
import MachineFormPanel from './MachineFormPanel';
import { fetchSweepingProjects } from '../../api/sweepingProjects';
import {
  createSweepingMachine,
  deactivateSweepingMachine,
  fetchSweepingMachines,
  fetchSweepingVehicleIds,
  updateSweepingMachine,
} from '../../api/sweepingMachines';

const PAGE_SIZE = 10;
const LIST_KEY = ['sweeping', 'machines'];
const PROJECTS_KEY = ['sweeping', 'projects', 'all'];
const VEHICLE_KEY = ['sweeping', 'vehicle-ids'];

const statusClass = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'sweep-badge sweep-badge--active';
  return 'sweep-badge sweep-badge--inactive';
};

const fmtHours = (start, end) => {
  if (!start && !end) return '—';
  return `${start || '—'} – ${end || '—'}`;
};

const SweepingMachinesPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [screen, setScreen] = useState({ view: 'list', mode: 'add', row: null });
  const [saveError, setSaveError] = useState('');

  const projectsQuery = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () => fetchSweepingProjects({ limit: 200, page: 1 }),
  });
  const projects = projectsQuery.data?.rows ?? [];

  const vehicleQuery = useQuery({
    queryKey: VEHICLE_KEY,
    queryFn: fetchSweepingVehicleIds,
  });
  const vehicleOptions = vehicleQuery.data ?? [];

  const listQuery = useQuery({
    queryKey: [...LIST_KEY, search, statusFilter, projectFilter, page],
    queryFn: () =>
      fetchSweepingMachines({
        search,
        status: statusFilter,
        projectId: projectFilter,
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
    queryClient.invalidateQueries({ queryKey: VEHICLE_KEY });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (screen.mode === 'edit' && screen.row?.id) {
        return updateSweepingMachine(screen.row.id, payload);
      }
      return createSweepingMachine(payload);
    },
    onSuccess: () => {
      setSaveError('');
      setScreen({ view: 'list', mode: 'add', row: null });
      refresh();
    },
    onError: (err) => setSaveError(err.message || 'Save failed'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => deactivateSweepingMachine(id),
    onSuccess: () => refresh(),
  });

  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleDeactivate = (row) => {
    const ok = window.confirm(`Deactivate machine "${row.machineName}" (${row.machineId})?`);
    if (!ok) return;
    deactivateMutation.mutate(row.id);
  };

  if (screen.view === 'form') {
    return (
      <PageLayout title="Machines" subtitle="Sweeping fleet and machine registry">
        <MachineFormPanel
          mode={screen.mode}
          initial={screen.row}
          projects={projects}
          vehicleOptions={vehicleOptions}
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
      title="Machines"
      subtitle="Sweeping fleet and machine registry"
      loading={listQuery.isLoading && !listQuery.data}
      error={listQuery.error}
      onRefresh={refresh}
    >
      <div className="sweep-projects">
        <div className="sweep-projects__toolbar">
          <form className="sweep-projects__search" onSubmit={handleSearchSubmit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search machine..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>

          <div className="sweep-projects__actions">
            <select
              className="hmi32-select sweep-projects__status"
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
              className="hmi32-select sweep-projects__status"
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M4 4v5h.6M20 20v-5h-.6M5 9a7 7 0 0112.8-2M19 15a7 7 0 01-12.8 2" strokeLinecap="round" />
              </svg>
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
              + Add Machine
            </button>
          </div>
        </div>

        <div className="hmi32-card sweep-projects__card">
          {rows.length === 0 ? (
            <p className="hmi32-empty-msg hmi32-empty-msg--pad">No machines found.</p>
          ) : (
            <div className="hmi32-table-scroll">
              <table className="hmi32-table sweep-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Machine ID</th>
                    <th>Machine Name</th>
                    <th>Vehicle Number</th>
                    <th>Project</th>
                    <th>Daily Capacity</th>
                    <th>Working Hours</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id}>
                      <td className="hmi32-table__muted">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="hmi32-table__mid">{row.machineId}</td>
                      <td>{row.machineName}</td>
                      <td>{row.vehicleNumber || '—'}</td>
                      <td>{row.assignedProjectName || row.assignedProjectId || '—'}</td>
                      <td>{row.sweepingKmPerDay} KM/day</td>
                      <td>{fmtHours(row.workStartTime, row.workEndTime)}</td>
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
                              disabled={deactivateMutation.isPending}
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
                aria-label="Previous page"
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
                aria-label="Next page"
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

export default SweepingMachinesPage;