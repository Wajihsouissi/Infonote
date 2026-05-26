import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../services/supabase/client';
import { useAuth } from '../../auth/useAuth';

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
 * Hook to fetch and track recently viewed notes
 */
export function useRecentlyViewed(workspaceId?: string) {
  const { user } = useAuth();
  const [recentNotes, setRecentNotes] = useState<RecentlyViewedNote[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRecent = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('recently_viewed_notes')
        .select('*')
        .eq('user_id', user.id)
        .order('last_opened_at', { ascending: false })
        .limit(5);
        
      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecentNotes(data as RecentlyViewedNote[]);
    } catch (err) {
      console.error('Failed to fetch recently viewed notes:', err);
    } finally {
      setLoading(false);
    }
  }, [user, workspaceId]);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  const trackNoteView = useCallback(async (nodeId: string, nodeTitle: string, nodeType: string, activeWorkspaceId: string) => {
    if (!user) return;
    if (!activeWorkspaceId) {
      console.warn('[recentlyViewed] No workspace ID available, skipping tracking');
      return;
    }

    try {
      const { error } = await supabase
        .from('recently_viewed_notes')
        .upsert({
          user_id: user.id,
          workspace_id: activeWorkspaceId,
          node_id: nodeId,
          node_title: nodeTitle || 'Untitled',
          node_type: nodeType,
          last_opened_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,workspace_id,node_id'
        });
        
      if (error) throw error;
      // Optionally refresh the list
      fetchRecent();
    } catch (err) {
      console.error('Failed to track note view:', err);
    }
  }, [user, fetchRecent]);

  return { recentNotes, loading, trackNoteView, refresh: fetchRecent };
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
