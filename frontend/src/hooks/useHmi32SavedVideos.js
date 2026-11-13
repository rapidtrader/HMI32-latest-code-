import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';

const PAGE = 40;

export function useSavedVideos(machineId, { source, cameraChannel } = {}) {
  const queryMachine = machineId?.trim() || undefined;
  const src = source?.trim() || undefined;
  const ch = cameraChannel?.trim().toUpperCase() || undefined;

  return useInfiniteQuery({
    queryKey: ['hmi32', 'saved-videos', queryMachine || 'all', src || 'all', ch || 'all'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const q = new URLSearchParams();
      q.set('limit', String(PAGE));
      q.set('skip', String(pageParam));
      if (queryMachine) q.set('machineId', queryMachine);
      if (src) q.set('source', src);
      if (ch) q.set('cameraChannel', ch);
      const data = await fetchApi(`/api/saved-videos?${q.toString()}`);
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
  });
}
