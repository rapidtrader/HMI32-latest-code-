import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { getSocketIoConnectConfig } from '../api/client';

export function useSavedVideoRealtime(queryMachine) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const { url, options } = getSocketIoConnectConfig();
    const socket = url ? io(url, options) : io(options);

    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));

    socket.on('saved-video:new', ({ machineId: mid }) => {
      if (queryMachine && mid && mid !== queryMachine) return;
      queryClient.invalidateQueries({ queryKey: ['hmi32', 'saved-videos'] });
    });

    return () => {
      socket.disconnect();
      setLive(false);
    };
  }, [queryClient, queryMachine]);

  return { live };
}
