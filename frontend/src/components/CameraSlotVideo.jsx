import { useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl } from '../api/client';

function streamToken(video) {
  return `${video?.updated_at || video?.created_at || ''}|${video?.sizeBytes || 0}`;
}

function useInView(rootMargin = '120px') {
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
      { root: null, rootMargin, threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}

/**
 * Lazy load + auto-retry when merge replaces GridFS mid-stream (ECONNRESET).
 */
export default function CameraSlotVideo({ video, onPlayingChange }) {
  const { ref, inView } = useInView();
  const videoRef = useRef(null);
  const retryRef = useRef(0);
  const retryingRef = useRef(false);
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [token, setToken] = useState(() => streamToken(video));
  const nextToken = streamToken(video);

  useEffect(() => {
    if (!armed || playing) return;
    if (nextToken !== token) {
      setToken(nextToken);
      setReloadKey((k) => k + 1);
      retryRef.current = 0;
      setError('');
    }
  }, [nextToken, playing, armed, token]);

  const streamSrc = useMemo(
    () =>
      apiUrl(
        `/api/camera-videos/${video.id}/stream?t=${encodeURIComponent(token.split('|')[0] || '')}&r=${reloadKey}`
      ),
    [video.id, token, reloadKey]
  );

  const arm = () => {
    setError('');
    retryRef.current = 0;
    setArmed(true);
  };

  const setPlayState = (isPlaying) => {
    setPlaying(isPlaying);
    onPlayingChange?.(isPlaying);
  };

  const retryStream = () => {
    if (retryingRef.current) return;
    if (retryRef.current >= 5) {
      setError('Could not play — try Merge old clips or wait for upload');
      return;
    }
    retryingRef.current = true;
    retryRef.current += 1;
    setError('Recording updating… retrying');
    setToken(streamToken(video));
    window.setTimeout(() => {
      setReloadKey((k) => k + 1);
      setError('');
      retryingRef.current = false;
      videoRef.current?.load();
    }, 1200 + retryRef.current * 400);
  };

  let body;
  if (!inView) {
    body = <div className="hmi32-video-item__player hmi32-video-item__placeholder" aria-hidden />;
  } else if (!armed) {
    body = (
      <button
        type="button"
        className="hmi32-video-item__player hmi32-video-item__load-btn"
        onClick={arm}
      >
        ▶ Load video
      </button>
    );
  } else {
    body = (
      <>
        {error && (
          <p className="hmi32-video-empty" style={{ margin: '0 0 0.35rem', fontSize: '0.78rem' }}>
            {error}
          </p>
        )}
        <video
          key={reloadKey}
          ref={videoRef}
          className="hmi32-video-item__player"
          controls
          preload="none"
          playsInline
          src={streamSrc}
          onPlay={() => setPlayState(true)}
          onPause={() => setPlayState(false)}
          onEnded={() => setPlayState(false)}
          onError={retryStream}
        />
      </>
    );
  }

  return (
    <div ref={ref} className="hmi32-video-item__player-wrap">
      {body}
    </div>
  );
}
