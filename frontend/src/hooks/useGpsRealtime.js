import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { getSocketIoConnectConfig } from '../api/client';

export function useGpsRealtime(deviceId) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(null);
  const did = deviceId?.trim() || '';

  useEffect(() => {
    const { url, options } = getSocketIoConnectConfig();
    const socket = io(url, options);

    const onGps = (point) => {
      if (!point?.deviceId) return;
      if (did && point.deviceId !== did) return;
      setLive(point);
      queryClient.setQueryData(['hmi32', 'gps', 'latest', point.deviceId], point);
      queryClient.invalidateQueries({ queryKey: ['hmi32', 'gps', 'history'] });
      queryClient.invalidateQueries({ queryKey: ['hmi32', 'gps', 'devices'] });
    };

    socket.on('gps:location', onGps);
    return () => {
      socket.off('gps:location', onGps);
      socket.disconnect();
    };
  }, [did, queryClient]);

  return { live };
}
