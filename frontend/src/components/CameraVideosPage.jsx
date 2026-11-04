import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  apiUrl,
  deleteCameraVideo,
  getApiBaseLabel,
  getPiBackendUrlHint,
  isLocalPiBackendHint,
  checkCameraVideosApi,
} from '../api/client';
import { useCameraVideos } from '../hooks/useHmi32Queries';
import PageLayout from './PageLayout';

const fmtBytes = (n) => {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
};

const CameraVideosPage = () => {
  const queryClient = useQueryClient();
  const [filterMachine, setFilterMachine] = useState('');
  const queryMachine = filterMachine.trim() || undefined;
  const { data: videos = [], isLoading, error, isFetching } = useCameraVideos(queryMachine);
  const [uploadError, setUploadError] = useState('');
  const [apiCheck, setApiCheck] = useState(null);

  useEffect(() => {
    checkCameraVideosApi().then(setApiCheck);
  }, []);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['hmi32', 'camera-videos'] });
  };

  const onDelete = async (id) => {
    if (!window.confirm('Delete this video from database?')) return;
    try {
      await deleteCameraVideo(id);
      refresh();
    } catch (e) {
      setUploadError(e.message || 'Delete failed');
    }
  };

  const machineOptions = [...new Set(videos.map((v) => v.machineId).filter(Boolean))];
  const piBackend = getPiBackendUrlHint();
  const piLocalDev = isLocalPiBackendHint(piBackend);

  return (
    <PageLayout
      title="Camera Videos"
      subtitle="From server database — Pi auto-records when cameras are ON; list refreshes every 3s"
      loading={isLoading}
      loadingText="Loading videos..."
      error={error}
      onRefresh={refresh}
    >
      {uploadError && <div className="hmi32-alert">{uploadError}</div>}

      <div className="hmi32-card" style={{ marginBottom: '1rem' }}>
        <div className="hmi32-card__head">
          <h2>API connection</h2>
        </div>
        <div style={{ padding: '0.85rem 1.1rem', fontSize: '0.82rem', color: '#374151', lineHeight: 1.5 }}>
          <p style={{ margin: '0 0 0.5rem' }}>
            <strong>Website reads from:</strong> {getApiBaseLabel()}
          </p>
          {piBackend && (
            <div
              style={{
                margin: '0.5rem 0',
                padding: '0.65rem 0.75rem',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
              }}
            >
              <p style={{ margin: 0, fontWeight: 600, color: '#1e40af' }}>Pi par ye set karo (same database):</p>
              <pre
                style={{
                  margin: '0.4rem 0 0',
                  fontSize: '0.78rem',
                  whiteSpace: 'pre-wrap',
                  color: '#1e3a8a',
                }}
              >
                {`// abcd_latest/data/backend.json\n{\n  "backendBaseUrl": "${piBackend}",\n  "canRequireResponse": true\n}`}
              </pre>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#374151' }}>
                Pi par <code>127.0.0.1</code> mat likho — woh Pi khud hai, PC nahi. File save karke HMI restart →
                Cameras → Start all.
                {piLocalDev ? (
                  <>
                    {' '}
                    PC par Node <strong>:4002</strong> chal raha ho to Windows Firewall port <strong>4002</strong>{' '}
                    allow karo.
                  </>
                ) : (
                  <>
                    {' '}
                    Clips ke liye stable live view ke baad <code>cameraAutoSave: true</code> ya{' '}
                    <code>CAMERA_AUTO_SAVE=1</code> (optional).
                  </>
                )}
              </p>
            </div>
          )}
          {!piBackend && (
            <p style={{ margin: '0 0 0.5rem' }}>
              <strong>Pi must upload to the same URL</strong> in <code>abcd_latest/data/backend.json</code>{' '}
              (<code>backendBaseUrl</code>) — use this PC&apos;s LAN IP, not <code>127.0.0.1</code>.
            </p>
          )}
          {apiCheck && !apiCheck.ok && (
            <div className="hmi32-alert" style={{ marginTop: '0.5rem' }}>
              {apiCheck.status === 404
                ? 'Camera Videos API missing on this server (404). Deploy latest backend (camera-videos routes + multer) and restart Node.'
                : `API problem: ${apiCheck.message}`}
            </div>
          )}
          {apiCheck?.ok && videos.length === 0 && (
            <p style={{ margin: '0.5rem 0 0', color: '#6b7280' }}>
              API OK — empty DB. Pi saves clips to <code>data/camera_videos.json</code> first, then
              uploads to this server (~90s after Start all with AUTO_SAVE=1). Page refreshes every 3s.
            </p>
          )}
        </div>
      </div>
      {isFetching && !isLoading && (
        <p className="hmi32-video-empty" style={{ paddingTop: 0 }}>
          Syncing with server…
        </p>
      )}

      <div className="hmi32-card">
        <div className="hmi32-card__head hmi32-card__head--split">
          <div className="hmi32-card__head-left">
            <svg className="hmi32-card__head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6h16M4 10h16M4 14h16M4 18h16" strokeLinecap="round" />
            </svg>
            <h2>Saved videos ({videos.length})</h2>
          </div>
          <select
            className="hmi32-select"
            value={filterMachine}
            onChange={(e) => setFilterMachine(e.target.value)}
          >
            <option value="">All machines</option>
            {machineOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {videos.length === 0 ? (
          <p className="hmi32-video-empty">
            No videos yet. On Pi HMI open Cameras → Start all — clips upload automatically to this server.
          </p>
        ) : (
          <div className="hmi32-video-grid">
            {videos.map((v) => (
              <article key={v.id} className="hmi32-video-item">
                <video
                  className="hmi32-video-item__player"
                  controls
                  preload="metadata"
                  src={apiUrl(`/api/camera-videos/${v.id}/stream`)}
                />
                <div className="hmi32-video-item__meta">
                  <p className="hmi32-video-item__title">{v.title || v.filename}</p>
                  <p className="hmi32-video-item__sub">
                    {v.machineId}
                    {v.cameraChannel ? ` · ${v.cameraChannel}` : ''}
                  </p>
                  <p className="hmi32-video-item__sub">
                    {fmtDate(v.created_at)} · {fmtBytes(v.sizeBytes)}
                  </p>
                  <button type="button" className="hmi32-video-item__delete" onClick={() => onDelete(v.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default CameraVideosPage;
