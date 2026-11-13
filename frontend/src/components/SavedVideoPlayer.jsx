import { useMemo, useRef, useState } from 'react';
import { apiUrl } from '../api/client';

export default function SavedVideoPlayer({ video }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');

  const streamSrc = useMemo(() => {
    if (!video?.id) return undefined;
    const t = encodeURIComponent(video.created_at || '');
    return apiUrl(`/api/saved-videos/${video.id}/stream?t=${t}`);
  }, [video?.id, video?.created_at]);

  if (!streamSrc) return null;

  return (
    <div className="hmi32-video-item__player-shell">
      {error ? (
        <p className="hmi32-video-item__placeholder">{error}</p>
      ) : (
        <video
          ref={videoRef}
          className="hmi32-video-item__player"
          src={streamSrc}
          controls
          preload="metadata"
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setError('Could not load video')}
        />
      )}
      {playing && <span className="hmi32-live-badge" style={{ background: '#2563eb' }}>PLAY</span>}
    </div>
  );
}
