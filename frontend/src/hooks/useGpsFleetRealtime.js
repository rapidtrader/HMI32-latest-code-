import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { getSocketIoConnectConfig } from '../api/client';
import { buildFleetStats, vehicleFromGps } from '../utils/buildLiveMapFleet';

const FLEET_KEY = ['live-map', 'fleet'];

const vehicleFromGpsPoint = (point, prev) => {
  const enrich = {
    machineId: point.deviceId,
    clientName: prev?.clientName || '',
    location: prev?.location || '',
    vehiclePlateNo: prev?.vehiclePlateNo || '',
    machineName: prev?.machineName || prev?.clientName || point.deviceId,
    projectName: prev?.projectName || '',
    vehicleType: prev?.vehicleType || 'HMI Unit',
    hmiOnline: prev?.hmiOnline ?? false,
    hmiLastEvent: prev?.hmiLastEvent || '',
    hmiUpdatedAt: prev?.hmiUpdatedAt || null,
    machineInfoRegistered: prev?.machineInfoRegistered ?? false,
    machineInactive: Boolean(prev?.machineInactive),
  };
  return vehicleFromGps(point, enrich);
};

export function useGpsFleetRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { url, options } = getSocketIoConnectConfig();
    const socket = io(url, options);

    const onGps = (point) => {
      if (!point?.deviceId) return;

      queryClient.setQueryData(['hmi32', 'gps', 'latest', point.deviceId], point);

      queryClient.setQueryData(FLEET_KEY, (prev) => {
        if (!prev) return prev;
        const vehicles = [...(prev.vehicles || [])];
        const idx = vehicles.findIndex((v) => v.deviceId === point.deviceId);
        const prevRow = idx >= 0 ? vehicles[idx] : null;
        const row = vehicleFromGpsPoint(point, prevRow);
        if (!row) return prev;
        if (idx >= 0) vehicles[idx] = row;
        else vehicles.push(row);
        vehicles.sort((a, b) => String(a.deviceId).localeCompare(String(b.deviceId)));
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          vehicles,
          stats: buildFleetStats(vehicles),
        };
      });

      queryClient.invalidateQueries({ queryKey: ['hmi32', 'gps', 'devices'] });
    };

    socket.on('gps:location', onGps);
    return () => {
      socket.off('gps:location', onGps);
      socket.disconnect();
    };
  }, [queryClient]);
}