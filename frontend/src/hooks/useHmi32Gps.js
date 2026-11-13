import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';

const PAGE = 50;

export function useGpsDevices() {
  return useQuery({
    queryKey: ['hmi32', 'gps', 'devices'],
    queryFn: async () => {
      const data = await fetchApi('/api/gps/devices');
      return data.data || [];
    },
    staleTime: 30_000,
  });
}

export function useGpsLatest(deviceId) {
  const did = deviceId?.trim() || '';
  return useQuery({
    queryKey: ['hmi32', 'gps', 'latest', did || 'none'],
    enabled: Boolean(did),
    queryFn: async () => {
      const data = await fetchApi(`/api/gps/latest/${encodeURIComponent(did)}`);
      return data.data;
    },
    refetchInterval: 15_000,
  });
}

export function useGpsHistory(deviceId) {
  const did = deviceId?.trim() || undefined;
  return useInfiniteQuery({
    queryKey: ['hmi32', 'gps', 'history', did || 'all'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const q = new URLSearchParams();
      q.set('limit', String(PAGE));
      q.set('skip', String(pageParam));
      if (did) q.set('deviceId', did);
      const data = await fetchApi(`/api/gps?${q.toString()}`);
      return {
        items: data.data || [],
        total: data.total ?? 0,
        skip: data.skip ?? pageParam,
      };
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + (p.items?.length || 0), 0);
      if (loaded >= (last.total || 0)) return undefined;
      return loaded;
    },
    select: (data) => ({
      items: data.pages.flatMap((p) => p.items || []),
      total: data.pages[0]?.total ?? 0,
    }),
    refetchInterval: 30_000,
  });
}
