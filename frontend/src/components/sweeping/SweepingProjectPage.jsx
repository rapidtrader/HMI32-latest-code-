import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '../PageLayout';
import ProjectFormModal from './ProjectFormModal';
import {
  createSweepingProject,
  deleteSweepingProject,
  fetchSweepingProjects,
  updateSweepingProject,
} from '../../api/sweepingProjects';

const PAGE_SIZE = 10;
const QUERY_KEY = ['sweeping', 'projects'];

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'numeric', year: 'numeric' });
};

const statusClass = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'sweep-badge sweep-badge--active';
  if (s === 'completed') return 'sweep-badge sweep-badge--done';
  return 'sweep-badge sweep-badge--inactive';
};

const SweepingProjectPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState({ open: false, mode: 'add', row: null });
  const [saveError, setSaveError] = useState('');

  const listQuery = useQuery({
    queryKey: [...QUERY_KEY, search, statusFilter, page],
    queryFn: () =>
      fetchSweepingProjects({
        search,
        status: statusFilter,
        page,
        limit: PAGE_SIZE,
      }),
  });

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (modal.mode === 'edit' && modal.row?.id) {
        return updateSweepingProject(modal.row.id, payload);
      }
      return createSweepingProject(payload);
    },
    onSuccess: () => {
      setSaveError('');
      setModal({ open: false, mode: 'add', row: null });
      refresh();
    },
    onError: (err) => setSaveError(err.message || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteSweepingProject(id),
    onSuccess: () => refresh(),
  });

  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);

  const openAdd = () => {
    setSaveError('');
    setModal({ open: true, mode: 'add', row: null });
  };

  const openView = (row) => {
    setSaveError('');
    setModal({ open: true, mode: 'view', row });
  };

  const openEdit = (row) => {
    setSaveError('');
    setModal({ open: true, mode: 'edit', row });
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleDelete = (row) => {
    const ok = window.confirm(`Delete project "${row.projectName}" (${row.projectId})?`);
    if (!ok) return;
    deleteMutation.mutate(row.id);
  };

  const initialForm = useMemo(() => modal.row, [modal.row]);

  return (
    <PageLayout
      title="Projects"
      subtitle="Sweeping management — project registry"
      loading={listQuery.isLoading && !listQuery.data}
      error={listQuery.error}
      onRefresh={refresh}
    >
      {listQuery.data?.apiMissing && (
        <div className="hmi32-alert" style={{ marginBottom: '1rem' }}>
          {listQuery.data.message}
        </div>
      )}
      <div className="sweep-projects">
        <div className="sweep-projects__toolbar">
          <form className="sweep-projects__search" onSubmit={handleSearchSubmit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search by ID or name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>

          <div className="sweep-projects__actions">
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
              <option value="Completed">Completed</option>
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

            <button type="button" className="hmi32-btn sweep-btn--violet" onClick={openAdd}>
              + Add Project
            </button>
          </div>
        </div>

        <div className="hmi32-card sweep-projects__card">
          {rows.length === 0 ? (
            <p className="hmi32-empty-msg hmi32-empty-msg--pad">No projects found.</p>
          ) : (
            <div className="hmi32-table-scroll">
              <table className="hmi32-table sweep-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Project ID</th>
                    <th>Project Name</th>
                    <th>Status</th>
                    <th>Speed Limit</th>
                    <th>Completion %</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id}>
                      <td className="hmi32-table__muted">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="hmi32-table__mid">{row.projectId}</td>
                      <td>{row.projectName}</td>
                      <td>
                        <span className={statusClass(row.status)}>{row.status}</span>
                      </td>
                      <td>{row.speedLimitKmh} KM/H</td>
                      <td>{row.completionPct}%</td>
                      <td className="hmi32-table__muted">{fmtDate(row.created_at)}</td>
                      <td>
                        <div className="sweep-row-actions">
                          <button type="button" className="sweep-link sweep-link--violet" onClick={() => openView(row)}>
                            View
                          </button>
                          <button type="button" className="sweep-link sweep-link--blue" onClick={() => openEdit(row)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="sweep-link sweep-link--red"
                            onClick={() => handleDelete(row)}
                            disabled={deleteMutation.isPending}
                          >
                            Delete
                          </button>
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

      <ProjectFormModal
        open={modal.open}
        mode={modal.mode}
        initial={initialForm}
        saving={saveMutation.isPending}
        error={saveError}
        onClose={() => {
          setSaveError('');
          setModal({ open: false, mode: 'add', row: null });
        }}
        onSave={(payload) => saveMutation.mutate(payload)}
      />
    </PageLayout>
  );
};

export default SweepingProjectPage;