import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { getSocketIoConnectConfig } from '../api/client';
import { mergeCameraVideoIntoList } from '../utils/cameraVideoSlots';

const QUERY_ROOT = ['hmi32', 'camera-videos'];

function patchList(queryClient, queryMachine, updater) {
  const keys = queryMachine
    ? [[`${QUERY_ROOT[0]}`, `${QUERY_ROOT[1]}`, queryMachine]]
    : [[`${QUERY_ROOT[0]}`, `${QUERY_ROOT[1]}`, 'all']];
  for (const key of keys) {
    queryClient.setQueryData(key, (old) => updater(old));
  }
}

/** Live slot updates from Mongo saves (Pi POST + background merge). */
export function useCameraVideoRealtime(queryMachine) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const { url, options } = getSocketIoConnectConfig();
    const socket = url ? io(url, options) : io(options);

    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));

    socket.on('camera:video:update', ({ video, machineId: mid }) => {
      if (!video?.id) return;
      if (queryMachine && mid && mid !== queryMachine) return;

      const merge = (old) => mergeCameraVideoIntoList(old, video);
      patchList(queryClient, queryMachine, merge);
      if (!queryMachine && mid) {
        queryClient.setQueryData([...QUERY_ROOT, mid], merge);
      }
    });

    socket.on('camera:video:delete', ({ id, machineId: mid }) => {
      if (!id) return;
      if (queryMachine && mid && mid !== queryMachine) return;
      const drop = (old) => (Array.isArray(old) ? old.filter((v) => v.id !== id) : []);
      patchList(queryClient, queryMachine, drop);
      if (mid) queryClient.setQueryData([...QUERY_ROOT, mid], drop);
    });

    return () => {
      socket.disconnect();
      setLive(false);
    };
  }, [queryClient, queryMachine]);

  return { live };
}
