import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured, supabase } from '../../../services/supabase/client';
import { readStorageMode } from '../../../services/storage/storagePreference';
import { useStore } from '../../../store/useStore';

const RECENT_VIEWS_PREFIX = 'infonote.recent-views.v1:';
const RECENT_VIEWS_CHANGED = 'infonote-recent-views-changed';

function readRecentViews(workspaceId?: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`${RECENT_VIEWS_PREFIX}${workspaceId || 'local'}`) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string' && Number.isFinite(Date.parse(entry[1])),
    ));
  } catch {
    return {};
  }
}

export interface RecentlyViewedNote {
  id: string;
  user_id: string;
  workspace_id: string;
  node_id: string;
  node_title: string;
  node_type: string;
  last_opened_at: string;
}

export interface SearchResult {
  node_id: string;
  node_type: string;
  node_title: string;
  content_snippet: string;
}

/**
 * Project recent notes from the same local graph as the canvas. Only the
 * app-level coordinator downloads canvas rows; opening this list (or using
 * its tracking callback in CanvasBoard) must never start another graph read.
 */
export function useRecentlyViewed(workspaceId?: string, { trackOnly = false } = {}) {
  const userId = useStore((state) => state.auth.userId);
  const [recentNotes, setRecentNotes] = useState<RecentlyViewedNote[]>([]);

  const fetchRecent = useCallback(() => {
    if (trackOnly) return;
    const state = useStore.getState();
    if (workspaceId && state.auth.activeWorkspaceId !== workspaceId) {
      setRecentNotes([]);
      return;
    }
    const views = readRecentViews(workspaceId);
    const mappedNotes = [...state.nodes]
      .sort((a, b) => (Date.parse(views[b.id]) || 0) - (Date.parse(views[a.id]) || 0))
      .slice(0, 5)
      .map((node): RecentlyViewedNote => {
        const inner = node.data as Record<string, unknown>;
        const rawTitle = inner.label || inner.title || inner.name || inner.text || '';
        const title = (typeof rawTitle === 'string' && rawTitle.trim())
          ? rawTitle.trim()
          : 'Untitled Node';
        return {
          id: node.id,
          user_id: userId || '',
          workspace_id: workspaceId || '',
          node_id: node.id,
          node_title: title,
          node_type: node.type || 'note',
          last_opened_at: views[node.id] || '',
        };
      });
    setRecentNotes(mappedNotes);
  }, [trackOnly, userId, workspaceId]);

  useEffect(() => {
    if (trackOnly) return;
    fetchRecent();
    const unsubscribe = useStore.subscribe((state) => state.nodes, fetchRecent);
    window.addEventListener(RECENT_VIEWS_CHANGED, fetchRecent);
    return () => {
      unsubscribe();
      window.removeEventListener(RECENT_VIEWS_CHANGED, fetchRecent);
    };
  }, [fetchRecent, trackOnly]);

  const trackNoteView = useCallback(async (nodeId: string, nodeTitle: string, nodeType: string, activeWorkspaceId: string) => {
    if (!activeWorkspaceId) return;
    const openedAt = new Date().toISOString();
    try {
      const views = { ...readRecentViews(activeWorkspaceId), [nodeId]: openedAt };
      const boundedViews = Object.fromEntries(Object.entries(views)
        .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1])).slice(0, 50));
      localStorage.setItem(`${RECENT_VIEWS_PREFIX}${activeWorkspaceId}`, JSON.stringify(boundedViews));
      window.dispatchEvent(new Event(RECENT_VIEWS_CHANGED));
    } catch {
      // Recency is optional metadata; a browser storage restriction must not
      // interfere with viewing or editing the durable workspace.
    }

    if (!userId || !isSupabaseConfigured || readStorageMode(userId) !== 'sync') return;
    try {
      const { error } = await supabase
        .from('recently_viewed_notes')
        .upsert({
          user_id: userId,
          workspace_id: activeWorkspaceId,
          node_id: nodeId,
          node_title: nodeTitle || 'Untitled',
          node_type: nodeType,
          last_opened_at: openedAt
        }, {
          onConflict: 'user_id,workspace_id,node_id'
        });
        
      if (error) throw error;
    } catch (err) {
      console.error('Failed to track note view:', err);
    }
  }, [userId]);

  return { recentNotes, loading: false, trackNoteView, refresh: fetchRecent };
}

/**
 * Hook for global search
 */
export function useGlobalSearch(workspaceId?: string) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const search = useCallback(async (query: string) => {
    if (!query.trim() || !workspaceId) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .rpc('search_notes', {
          search_query: query,
          _workspace_id: workspaceId
        });

      if (error) throw error;
      setResults(data as SearchResult[]);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [workspaceId]);

  return { search, results, isSearching };
}
