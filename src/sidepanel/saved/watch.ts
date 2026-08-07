import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { showLimitModal } from '../modal.js';
import { showToast } from '../toast.js';
import { loadQuotaFromAPI } from '../quota.js';
import { MAX_CHECK_FAILURES } from '../../watch/plans.js';

/**
 * Turn watching on or off for a saved prospect.
 *
 * Watched accounts are capped separately from saved ones: saving is a bookmark
 * and costs nothing, watching costs a fetch and a model call every cycle.
 */
export async function setWatchEnabled(savedId: string, enabled: boolean): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return false;

  if (enabled && state.totalWatchedCount >= state.maxWatchedLimit) {
    showLimitModal('watch');
    return false;
  }

  const { error } = await supabase
    .from('saved_analyses')
    .update(
      enabled
        ? // Re-enabling clears the failure counter so a site that has since
          // become reachable gets checked again.
          { watch_enabled: true, check_failure_count: 0 }
        : { watch_enabled: false }
    )
    .eq('user_id', user.id)
    .eq('id', savedId);

  if (error) {
    console.error('Failed to update watch state:', error);
    showToast('Could not update watching. Please try again.');
    return false;
  }

  state.totalWatchedCount = Math.max(0, state.totalWatchedCount + (enabled ? 1 : -1));
  void loadQuotaFromAPI(true);

  return true;
}

export function isWatchStalled(item: {
  watch_enabled?: boolean | null;
  check_failure_count?: number | null;
}): boolean {
  return !item.watch_enabled && Number(item.check_failure_count || 0) >= MAX_CHECK_FAILURES;
}

export function formatLastChecked(value: string | null | undefined): string {
  if (!value) return 'Not checked yet';

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Not checked yet';

  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'Checked just now';
  if (minutes < 60) return `Checked ${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Checked ${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `Checked ${days}d ago`;
}
