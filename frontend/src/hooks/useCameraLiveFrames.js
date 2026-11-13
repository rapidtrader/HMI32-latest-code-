import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { getSocketIoConnectConfig } from '../api/client';

function slotKey(machineId, source, channel) {
  return `${machineId || ''}:${source || 'ahd'}:${channel}`;
}

function slotLabel(source, channel) {
  const ch = Number(channel) || 0;
  if (source === 'mdvr') return `MDVR ${ch}`;
  return `CH${ch}`;
}

/**
 * Live JPEG tiles from Pi (AHD + MDVR) — camera:live:frame.
 * Saves still use POST /api/camera-videos/save + camera:video:update.
 */
export function useCameraLiveFrames(queryMachine) {
  const [live, setLive] = useState(false);
  const [frames, setFrames] = useState(() => new Map());

  useEffect(() => {
    const { url, options } = getSocketIoConnectConfig();
    const socket = url ? io(url, options) : io(options);

    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));

    socket.on('camera:live:frame', (payload) => {
      if (!payload?.jpeg) return;
      const mid = String(payload.machineId || '').trim();
      if (!mid) return;
      if (queryMachine && mid !== queryMachine) return;

      const source = String(payload.source || 'ahd').toLowerCase();
      const channel = Number(payload.channel) || 0;
      const key = slotKey(mid, source, channel);
      const dataUrl = `data:image/jpeg;base64,${payload.jpeg}`;

      setFrames((prev) => {
        const next = new Map(prev);
        next.set(key, {
          machineId: mid,
          source,
          channel,
          label: slotLabel(source, channel),
          dataUrl,
          tsEpoch: payload.tsEpoch || Date.now(),
        });
        return next;
      });
    });

    return () => {
      socket.disconnect();
      setLive(false);
    };
  }, [queryMachine]);

  const tiles = useMemo(() => {
    return [...frames.values()].sort((a, b) => {
      if (a.machineId !== b.machineId) return a.machineId.localeCompare(b.machineId);
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.channel - b.channel;
    });
  }, [frames]);

  return { liveSocket: live, liveTiles: tiles };
}
