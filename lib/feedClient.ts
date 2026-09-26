import { useCallback, useEffect, useMemo } from "react";
import { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import { track } from "./telemetry";
import {
  feedQueryString,
  type FeedFilters,
  type FeedItem,
  type FeedPage,
} from "./feedTypes";

async function fetchFeedPage(url: string): Promise<FeedPage> {
  const started = performance.now();
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    track("feed_page_loaded", {
      level: "error",
      durationMs: Math.round(performance.now() - started),
      errorCode: String(res.status),
      meta: { url },
    });
    throw new Error(`Feed request failed (${res.status})`);
  }
  const page = (await res.json()) as FeedPage;
  track("feed_page_loaded", {
    durationMs: Math.round(performance.now() - started),
    meta: {
      count: page.items.length,
      paged: url.includes("cursor="),
      videoOnly: url.includes("videoOnly=1"),
    },
  });
  return page;
}

export type UseFeedOptions = {
  limit?: number;
  /** SSR first page; only pass when it was produced with the same filters. */
  fallback?: FeedPage;
};

export function useFeed(filters: FeedFilters, opts: UseFeedOptions = {}) {
  const { limit, fallback } = opts;
  const filterKey = feedQueryString(filters);

  const getKey = useCallback(
    (index: number, prev: FeedPage | null) => {
      if (prev && !prev.nextCursor) return null;
      const qs = feedQueryString(filters, {
        limit,
        cursor: index === 0 ? null : prev?.nextCursor,
      });
      return `/api/feed${qs ? `?${qs}` : ""}`;
    },
    [filterKey, limit],
  );

  // Seed the per-page cache so loading page 2 doesn't refetch the SSR page.
  const { cache, mutate: globalMutate } = useSWRConfig();
  const firstKey = getKey(0, null);
  useEffect(() => {
    if (fallback && firstKey && cache.get(firstKey)?.data === undefined) {
      void globalMutate(firstKey, fallback, { revalidate: false });
    }
  }, [fallback, firstKey, cache, globalMutate]);

  const swr = useSWRInfinite<FeedPage>(getKey, fetchFeedPage, {
    fallbackData: fallback ? [fallback] : undefined,
    revalidateOnMount: !fallback,
    revalidateFirstPage: false,
    revalidateOnFocus: false,
    persistSize: false,
  });

  const { data, size, setSize, isValidating, error, mutate } = swr;
  const pages = data ?? [];

  const merged = useMemo(() => {
    const items: FeedItem[] = [];
    const seen = new Set<string>();
    const teams: FeedPage["teams"] = {};
    const challenges: FeedPage["challenges"] = {};
    for (const page of pages) {
      Object.assign(teams, page.teams);
      Object.assign(challenges, page.challenges);
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
    }
    return { items, teams, challenges };
  }, [pages]);

  const lastPage = pages[pages.length - 1];
  const hasMore = !lastPage || lastPage.nextCursor != null;
  const isLoadingMore = isValidating && size > pages.length;

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    void setSize(size + 1);
  }, [hasMore, isLoadingMore, setSize, size]);

  /** Optimistically patch or drop items across all loaded pages. */
  const updateItems = useCallback(
    (
      fn: (item: FeedItem) => FeedItem | null,
      options: { revalidate?: boolean } = {},
    ) =>
      mutate(
        (current) =>
          current?.map((page) => ({
            ...page,
            items: page.items
              .map(fn)
              .filter((i): i is FeedItem => i != null),
          })),
        { revalidate: options.revalidate ?? false },
      ),
    [mutate],
  );

  return {
    ...merged,
    pages,
    error,
    hasMore,
    isLoading: !data && !error,
    isLoadingMore,
    loadMore,
    updateItems,
    mutate,
  };
}
