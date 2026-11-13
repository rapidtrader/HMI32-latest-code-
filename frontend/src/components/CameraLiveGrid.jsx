export default function CameraLiveGrid({ tiles, socketLive }) {
  if (!tiles?.length) {
    return (
      <p className="hmi32-video-empty">
        {socketLive
          ? 'Waiting for live frames — on Pi start Cameras / MDVR preview (SOCKET_IO_ENABLED=1).'
          : 'Socket disconnected — live preview unavailable.'}
      </p>
    );
  }

  return (
    <div className="hmi32-video-grid hmi32-video-grid--live">
      {tiles.map((t) => (
        <article key={`${t.machineId}-${t.source}-${t.channel}`} className="hmi32-video-item">
          <div className="hmi32-video-item__player hmi32-live-frame-wrap">
            <img
              className="hmi32-live-frame"
              src={t.dataUrl}
              alt={`${t.label} ${t.machineId}`}
              decoding="async"
            />
            <span className="hmi32-live-badge">LIVE</span>
          </div>
          <div className="hmi32-video-item__meta">
            <p className="hmi32-video-item__title">
              {t.label} · {t.source.toUpperCase()}
            </p>
            <p className="hmi32-video-item__sub">{t.machineId}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
