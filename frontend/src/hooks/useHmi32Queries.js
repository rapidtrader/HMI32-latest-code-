import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';

export function useHmi32Latest() {
  return useQuery({
    queryKey: ['hmi32', 'latest'],
    queryFn: async () => {
      const data = await fetchApi('/api/hmi32/latest');
      const rows = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
      return rows;
    },
    refetchInterval: 2000,
  });
}

export function useHmi32History() {
  return useQuery({
    queryKey: ['hmi32', 'history'],
    queryFn: async () => {
      const data = await fetchApi('/api/hmi32/history');
      return Array.isArray(data.data) ? data.data : [];
    },
    refetchInterval: 2000,
  });
}

export function useMachineInfo() {
  return useQuery({
    queryKey: ['hmi32', 'machine-info'],
    queryFn: async () => {
      const [liveData, dbData] = await Promise.all([
        fetchApi('/api/hmi32/latest'),
        fetchApi('/api/hmi32/machine-info'),
      ]);
      const machines = Array.isArray(liveData.data)
        ? liveData.data
        : liveData.data
          ? [liveData.data]
          : [];
      const dbInfos = Array.isArray(dbData.data)
        ? dbData.data
        : dbData.data
          ? [dbData.data]
          : [];
      return { machines, dbInfos };
    },
    refetchInterval: 15000,
  });
}

export function useReportsSessions() {
  return useQuery({
    queryKey: ['hmi32', 'reports', 'sessions'],
    queryFn: async () => {
      const data = await fetchApi('/api/hmi32/reports/sessions');
      return Array.isArray(data.data) ? data.data : [];
    },
  });
}

export function useReportsRuntime() {
  return useQuery({
    queryKey: ['hmi32', 'reports', 'runtime'],
    queryFn: async () => {
      const data = await fetchApi('/api/hmi32/reports/runtime');
      return data.data || { suction_total_seconds: 0, daily_seconds: {} };
    },
  });
}
