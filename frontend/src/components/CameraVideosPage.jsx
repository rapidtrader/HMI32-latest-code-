import { useState } from 'react';
import { useCameraVideoRealtime } from '../hooks/useCameraVideoRealtime';
import CameraLiveGrid from './CameraLiveGrid';
import PageLayout from './PageLayout';
import { useCameraLiveFrames } from '../hooks/useCameraLiveFrames';

const CameraVideosPage = () => {
  const [filterMachine, setFilterMachine] = useState('');
  const [filterLiveSource, setFilterLiveSource] = useState('');
  const [filterLiveChannel, setFilterLiveChannel] = useState('');
  const queryMachine = filterMachine.trim() || undefined;

  const { live: socketLive } = useCameraVideoRealtime(queryMachine);
  const { liveSocket, liveTiles } = useCameraLiveFrames(queryMachine);

  const liveTilesFiltered = liveTiles.filter((t) => {
    if (filterLiveSource && t.source !== filterLiveSource) return false;
    if (filterLiveChannel !== '') {
      const want = Number(filterLiveChannel);
      if (Number(t.channel) !== want) return false;
    }
    return true;
  });

  const liveChannelOptions = (() => {
    const fromTiles = [...new Set(liveTiles.map((t) => Number(t.channel)).filter((n) => n > 0))].sort(
      (a, b) => a - b,
    );
    const max = filterLiveSource === 'mdvr' ? 8 : filterLiveSource === 'ahd' ? 4 : 8;
    const preset = Array.from({ length: max }, (_, i) => i + 1);
    return [...new Set([...preset, ...fromTiles])].sort((a, b) => a - b);
  })();

  const machineOptions = [...new Set(liveTiles.map((t) => t.machineId).filter(Boolean))];

  return (
    <PageLayout
      title="Camera Videos"
      subtitle={
        socketLive || liveSocket
          ? 'Live AHD + MDVR via Socket.IO from Pi'
          : 'Waiting for live frames — open Cameras → Start all on Pi'
      }
    >
      <div className="hmi32-card">
        <div className="hmi32-card__head hmi32-card__head--split">
          <div className="hmi32-card__head-left">
            <svg className="hmi32-card__head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            </svg>
            <h2>
              Live preview — AHD + MDVR ({liveTilesFiltered.length}
              {liveTilesFiltered.length !== liveTiles.length ? ` / ${liveTiles.length}` : ''})
            </h2>
          </div>
          <select className="hmi32-select" value={filterMachine} onChange={(e) => setFilterMachine(e.target.value)}>
            <option value="">All machines</option>
            {machineOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            className="hmi32-select"
            value={filterLiveSource}
            onChange={(e) => {
              setFilterLiveSource(e.target.value);
              setFilterLiveChannel('');
            }}
          >
            <option value="">All sources</option>
            <option value="ahd">AHD</option>
            <option value="mdvr">MDVR</option>
          </select>
          <select
            className="hmi32-select"
            value={filterLiveChannel}
            onChange={(e) => setFilterLiveChannel(e.target.value)}
          >
            <option value="">{filterLiveSource === 'mdvr' ? 'All MDVR ch' : 'All channels'}</option>
            {liveChannelOptions.map((n) => (
              <option key={n} value={String(n)}>
                {filterLiveSource === 'mdvr' ? `MDVR ${n}` : `CH${n}`}
              </option>
            ))}
          </select>
        </div>
        <CameraLiveGrid tiles={liveTilesFiltered} socketLive={liveSocket} />
      </div>
    </PageLayout>
  );
};

export default CameraVideosPage;