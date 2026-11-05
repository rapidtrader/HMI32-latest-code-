import { useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl } from '../api/client';

function streamToken(video) {
  return `${video?.updated_at || video?.created_at || ''}|${video?.sizeBytes || 0}`;
}

function useInView(rootMargin = '320px') {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { root: null, rootMargin, threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}

/**
 * Locked stream URL; metadata-first (no full-file preload). Play from controls after ready.
 */
export default function CameraSlotVideo({ video, onPlayingChange }) {
  const { ref, inView } = useInView();
  const videoRef = useRef(null);
  const retryRef = useRef(0);
  const retryingRef = useRef(false);
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState('');
  const [streamLock, setStreamLock] = useState(null);
  const [playerGen, setPlayerGen] = useState(0);

  const streamSrc = useMemo(() => {
    if (!streamLock) return undefined;
    const t = encodeURIComponent(streamLock.split('|')[0] || '');
    return apiUrl(`/api/camera-videos/${video.id}/stream?t=${t}&lock=${playerGen}`);
  }, [video.id, streamLock, playerGen]);

  const setPlayState = (isPlaying) => {
    setPlaying(isPlaying);
    onPlayingChange?.(isPlaying);
  };

  const armLoad = () => {
    setError('');
    retryRef.current = 0;
    setStreamLock(streamToken(video));
    setPlayerGen(0);
    setBuffering(true);
    setArmed(true);
  };

  const onLoadedMetadata = () => {
    setBuffering(false);
  };

  const onWaiting = () => {
    if (armed) setBuffering(true);
  };

  const onCanPlay = () => {
    setBuffering(false);
  };

  const retryStream = () => {
    if (retryingRef.current) return;
    if (retryRef.current >= 3) {
      setError('Could not load — try Merge old clips');
      setBuffering(false);
      return;
    }
    retryingRef.current = true;
    retryRef.current += 1;
    setBuffering(true);
    setError('');
    window.setTimeout(() => {
      setPlayerGen((g) => g + 1);
      retryingRef.current = false;
    }, 800);
  };

  let body;
  if (!inView) {
    body = <div className="hmi32-video-item__player hmi32-video-item__placeholder" aria-hidden />;
  } else if (!armed) {
    body = (
      <button
        type="button"
        className="hmi32-video-item__player hmi32-video-item__load-btn"
        onClick={armLoad}
      >
        ▶ Load
      </button>
    );
  } else {
    body = (
      <div className="hmi32-video-item__player-shell">
        {buffering && (
          <div className="hmi32-video-item__buffer" aria-live="polite">
            <div className="hmi32-spinner hmi32-spinner--sm" />
            <span>Loading…</span>
          </div>
        )}
        {error && (
          <p className="hmi32-video-empty" style={{ margin: '0 0 0.35rem', fontSize: '0.78rem' }}>
            {error}
          </p>
        )}
        <video
          ref={videoRef}
          className="hmi32-video-item__player"
          controls
          preload="metadata"
          playsInline
          src={streamSrc}
          onLoadedMetadata={onLoadedMetadata}
          onWaiting={onWaiting}
          onCanPlay={onCanPlay}
          onPlay={() => setPlayState(true)}
          onPause={() => setPlayState(false)}
          onEnded={() => setPlayState(false)}
          onError={retryStream}
        />
      </div>
    );
  }

  return (
    <div ref={ref} className="hmi32-video-item__player-wrap">
      {body}
    </div>
  );
}
