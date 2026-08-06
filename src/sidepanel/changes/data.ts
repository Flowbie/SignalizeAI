import { supabase } from '../supabase.js';
import { state } from '../state.js';

export interface ProspectChange {
  id: string;
  saved_analysis_id: string;
  domain: string;
  detected_at: string;
  change_type: 'pricing' | 'hiring' | 'messaging' | 'new_page';
  severity: 'major' | 'minor';
  before_text: string | null;
  after_text: string | null;
  summary: string | null;
  suggested_opener: string | null;
  seen_at: string | null;
  dismissed_at: string | null;
}

export interface ProspectSnapshot {
  id: string;
  captured_at: string;
  title: string | null;
  meta_description: string | null;
  headings: string[] | null;
  pricing_present: boolean | null;
  pricing_amounts: string[] | null;
  careers_roles: string[] | null;
  fetch_status: string | null;
}

const FREE_FEED_WINDOW_DAYS = 7;

/** Free sees the alerts, just a shorter history of them. */
function feedCutoffIso(): string | null {
  if ((state.currentPlan || 'free').toLowerCase() !== 'free') return null;
  return new Date(Date.now() - FREE_FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function fetchChanges(limit = 50): Promise<ProspectChange[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return [];

  let query = supabase
    .from('prospect_changes')
    .select('*')
    .eq('user_id', user.id)
    .is('dismissed_at', null);

  const cutoff = feedCutoffIso();
  if (cutoff) query = query.gte('detected_at', cutoff);

  const { data, error } = await query.order('detected_at', { ascending: false }).limit(limit);

  if (error) {
    console.error('Failed to load changes:', error);
    return [];
  }

  return (data || []) as ProspectChange[];
}

export async function countUnseenChanges(): Promise<number> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return 0;

  const { count, error } = await supabase
    .from('prospect_changes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('seen_at', null)
    .is('dismissed_at', null);

  if (error) return 0;
  return count || 0;
}

/** Called when the feed is opened. Clears the action badge. */
export async function markChangesSeen(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  const { error } = await supabase
    .from('prospect_changes')
    .update({ seen_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('seen_at', null)
    .in('id', ids);

  if (error) console.warn('Failed to mark changes seen', error);
}

export async function dismissChange(id: string): Promise<boolean> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return false;

  const { error } = await supabase
    .from('prospect_changes')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('id', id);

  if (error) {
    console.error('Failed to dismiss change:', error);
    return false;
  }

  return true;
}

/** Per-account history. This is the part that makes the archive legible. */
export async function fetchSnapshotTimeline(
  savedAnalysisId: string,
  limit = 12
): Promise<ProspectSnapshot[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('prospect_snapshots')
    .select(
      'id,captured_at,title,meta_description,headings,pricing_present,pricing_amounts,careers_roles,fetch_status'
    )
    .eq('user_id', user.id)
    .eq('saved_analysis_id', savedAnalysisId)
    .order('captured_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to load snapshot timeline:', error);
    return [];
  }

  return (data || []) as ProspectSnapshot[];
}
