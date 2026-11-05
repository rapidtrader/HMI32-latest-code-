import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../api/client';

function streamToken(video) {
  return `${video?.updated_at || video?.created_at || ''}|${video?.sizeBytes || 0}`;
}

/** Stable player — does not remount on 3s list refresh while user is watching. */
export default function CameraSlotVideo({ video, onPlayingChange }) {
  const elRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [token, setToken] = useState(() => streamToken(video));
  const nextToken = streamToken(video);

  useEffect(() => {
    if (playing) return;
    if (nextToken !== token) setToken(nextToken);
  }, [nextToken, playing, token]);

  const setPlayState = (isPlaying) => {
    setPlaying(isPlaying);
    onPlayingChange?.(isPlaying);
  };

  const src = apiUrl(
    `/api/camera-videos/${video.id}/stream?t=${encodeURIComponent(token.split('|')[0] || '')}`
  );

  return (
    <video
      ref={elRef}
      className="hmi32-video-item__player"
      controls
      preload="metadata"
      playsInline
      src={src}
      onPlay={() => setPlayState(true)}
      onPause={() => setPlayState(false)}
      onEnded={() => setPlayState(false)}
    />
  );
}
