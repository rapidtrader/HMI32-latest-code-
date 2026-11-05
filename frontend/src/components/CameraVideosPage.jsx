import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  compactCameraVideos,
  deleteCameraVideo,
} from '../api/client';
import { useCameraVideos } from '../hooks/useHmi32Queries';
import { useCameraVideoRealtime } from '../hooks/useCameraVideoRealtime';
import { channelSortKey, inferCameraChannel } from '../utils/cameraVideoSlots';
import CameraSlotVideo from './CameraSlotVideo';
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

const fmtDuration = (sec) => {
  const s = Math.round(Number(sec) || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
};

const displayTitle = (v) => {
  const ch = inferCameraChannel(v);
  if (ch) return ch;
  return v?.title || v?.filename || 'Camera';
};

/** Only block empty slots — small but growing files should still play. */
const isEmptySlot = (v) => (Number(v.sizeBytes) || 0) < 500;

const CameraVideosPage = () => {
  const queryClient = useQueryClient();
  const [filterMachine, setFilterMachine] = useState('');
  const queryMachine = filterMachine.trim() || undefined;
  const [mergeHint, setMergeHint] = useState('');
  const [uploadError, setUploadError] = useState('');

  const [playingCount, setPlayingCount] = useState(0);

  const onVideoPlayingChange = (isPlaying) => {
    setPlayingCount((n) => Math.max(0, n + (isPlaying ? 1 : -1)));
  };

  const { live: socketLive } = useCameraVideoRealtime(queryMachine);

  const { data: videosRaw = [], isLoading, error } = useCameraVideos(queryMachine, {
    pausePolling: socketLive,
  });
  const videos = [...videosRaw].sort((a, b) => channelSortKey(a) - channelSortKey(b));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['hmi32', 'camera-videos'] });
  };

  const runMergeOldClips = async () => {
    setUploadError('');
    setMergeHint('Merging old segments (may take 1–2 min)…');
    try {
      await compactCameraVideos(queryMachine, { force: true });
      setMergeHint('');
      refresh();
    } catch (e) {
      setMergeHint('');
      setUploadError(e.message || 'Could not merge old clips on server');
    }
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

  return (
    <PageLayout
      title="Camera Videos"
      subtitle={
        socketLive
          ? 'Latest 10 min recording per channel (direct play) · Socket.IO'
          : 'Latest 10 min recording per channel — Merge old clips for longer history'
      }
      loading={isLoading}
      loadingText="Loading videos..."
      error={error}
      onRefresh={refresh}
    >
      {uploadError && <div className="hmi32-alert">{uploadError}</div>}
      {mergeHint && <div className="hmi32-alert">{mergeHint}</div>}

      <div className="hmi32-card">
        <div className="hmi32-card__head hmi32-card__head--split">
          <div className="hmi32-card__head-left">
            <svg className="hmi32-card__head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6h16M4 10h16M4 14h16M4 18h16" strokeLinecap="round" />
            </svg>
            <h2>Live camera slots ({videos.length})</h2>
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
          <button type="button" className="hmi32-btn hmi32-btn--secondary" onClick={runMergeOldClips}>
            Merge old clips
          </button>
        </div>

        {videos.length === 0 ? (
          <p className="hmi32-video-empty">
            No videos yet. On Pi HMI open Cameras → Start all — clips upload automatically to this server.
          </p>
        ) : (
          <div className="hmi32-video-grid">
            {videos.map((v) => {
              const empty = isEmptySlot(v);
              return (
              <article key={v.id} className="hmi32-video-item">
                {!empty ? (
                  <CameraSlotVideo video={v} onPlayingChange={onVideoPlayingChange} />
                ) : (
                  <div className="hmi32-video-item__player hmi32-video-empty" style={{ minHeight: 120 }}>
                    No frames yet — start this camera on Pi preview
                  </div>
                )}
                <div className="hmi32-video-item__meta">
                  <p className="hmi32-video-item__title">{displayTitle(v)}</p>
                  <p className="hmi32-video-item__sub">{v.machineId}</p>
                  <p className="hmi32-video-item__sub">
                    Updated {fmtDate(v.updated_at || v.created_at)} · {fmtBytes(v.sizeBytes)}
                    {v.durationSec
                      ? v.playbackMode === 'direct'
                        ? ` · ${fmtDuration(v.durationSec)} recording`
                        : ` · growing ${fmtDuration(v.durationSec)}`
                      : ''}
                  </p>
                  <button type="button" className="hmi32-video-item__delete" onClick={() => onDelete(v.id)}>
                    Delete
                  </button>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default CameraVideosPage;
