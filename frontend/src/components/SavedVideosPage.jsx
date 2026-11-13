import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import PageLayout from './PageLayout';
import SavedVideoPlayer from './SavedVideoPlayer';
import { useSavedVideos } from '../hooks/useHmi32SavedVideos';
import { useSavedVideoRealtime } from '../hooks/useSavedVideoRealtime';
import { channelSortKey, inferCameraChannel } from '../utils/cameraVideoSlots';

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
  if (!s) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
};

export default function SavedVideosPage() {
  const queryClient = useQueryClient();
  const [filterMachine, setFilterMachine] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const queryMachine = filterMachine.trim() || undefined;
  const queryChannel = filterChannel.trim().toUpperCase() || undefined;
  const querySource =
    filterSource ||
    (queryChannel?.startsWith('MDVR') ? 'mdvr' : queryChannel?.startsWith('CH') ? 'ahd' : undefined);

  const { live } = useSavedVideoRealtime(queryMachine);

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSavedVideos(queryMachine, {
    source: querySource,
    cameraChannel: queryChannel,
  });

  const matchFilters = (v) => {
    if (querySource && String(v?.source || 'ahd').toLowerCase() !== querySource) return false;
    if (queryChannel) {
      const ch = inferCameraChannel(v);
      if (ch !== queryChannel) return false;
    }
    return true;
  };

  const videos = [...(data?.items || [])].filter(matchFilters).sort(
    (a, b) => channelSortKey(a) - channelSortKey(b)
  );
  const total =
    queryChannel || querySource ? videos.length : data?.total ?? videos.length;

  const machineOptions = [...new Set(videos.map((v) => v.machineId).filter(Boolean))];

  const channelOptions = (() => {
    const fromData = [
      ...new Set(videos.map((v) => inferCameraChannel(v)).filter(Boolean)),
    ].sort((a, b) => channelSortKey({ cameraChannel: a }) - channelSortKey({ cameraChannel: b }));
    const presets =
      filterSource === 'mdvr'
        ? Array.from({ length: 8 }, (_, i) => `MDVR${i + 1}`)
        : filterSource === 'ahd'
          ? ['CH1', 'CH2', 'CH3', 'CH4']
          : [...Array.from({ length: 4 }, (_, i) => `CH${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `MDVR${i + 1}`)];
    return [...new Set([...presets, ...fromData])].sort(
      (a, b) => channelSortKey({ cameraChannel: a }) - channelSortKey({ cameraChannel: b })
    );
  })();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['hmi32', 'saved-videos'] });
  };

  return (
    <PageLayout
      title="Saved Videos Archive"
      subtitle={
        live
          ? 'All clips saved from Pi (append-only) · Socket.IO · server delete disabled'
          : 'All clips saved from Pi — no delete on server'
      }
      loading={isLoading}
      loadingText="Loading saved videos..."
      error={error}
      onRefresh={refresh}
    >
      <div className="hmi32-card">
        <div className="hmi32-card__head hmi32-card__head--split">
          <div className="hmi32-card__head-left">
            <h2>Archive ({total} total, showing {videos.length})</h2>
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
          <select
            className="hmi32-select"
            value={filterSource}
            onChange={(e) => {
              setFilterSource(e.target.value);
              setFilterChannel('');
            }}
          >
            <option value="">All sources</option>
            <option value="ahd">AHD</option>
            <option value="mdvr">MDVR</option>
          </select>
          <select
            className="hmi32-select"
            value={filterChannel}
            onChange={(e) => {
              const ch = e.target.value;
              setFilterChannel(ch);
              if (ch.startsWith('MDVR')) setFilterSource('mdvr');
              else if (ch.startsWith('CH')) setFilterSource('ahd');
            }}
            title={filterSource === 'mdvr' ? 'MDVR channel' : 'Camera channel'}
          >
            <option value="">{filterSource === 'mdvr' ? 'All MDVR ch' : 'All channels'}</option>
            {channelOptions.map((ch) => (
              <option key={ch} value={ch}>
                {ch.startsWith('MDVR') ? ch.replace(/^MDVR/, 'MDVR ') : ch}
              </option>
            ))}
          </select>
        </div>

        {videos.length === 0 ? (
          <p className="hmi32-video-empty">
            No saved videos yet. On Pi set cameraAutoSave true and wait for clip uploads to
            POST /api/saved-videos.
          </p>
        ) : (
          <>
            <div className="hmi32-video-grid">
              {videos.map((v) => (
                <article key={v.id} className="hmi32-video-item">
                  <SavedVideoPlayer video={v} />
                  <div className="hmi32-video-item__meta">
                    <p className="hmi32-video-item__title">
                      {inferCameraChannel(v) || v.cameraChannel || v.title || v.filename}
                      {v.source ? ` · ${String(v.source).toUpperCase()}` : ' · AHD'}
                    </p>
                    <p className="hmi32-video-item__sub">{v.machineId}</p>
                    <p className="hmi32-video-item__sub">
                      {fmtDate(v.created_at)} · {fmtBytes(v.sizeBytes)} · {fmtDuration(v.durationSec)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            {hasNextPage && (
              <button
                type="button"
                className="hmi32-btn hmi32-btn--secondary"
                style={{ margin: '1rem' }}
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
