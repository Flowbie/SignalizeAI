import { state } from '../state.js';
import { countUnseenChanges } from './data.js';

/**
 * The unseen-change count, shown both on the menu entry and on the extension
 * action. Under client-side polling this badge is the entire retention
 * mechanism: without it the user never learns there is anything to come back
 * for.
 */
export async function refreshChangesBadge(): Promise<void> {
  const count = await countUnseenChanges();
  state.unseenChangesCount = count;
  renderChangesBadge();

  chrome.runtime.sendMessage({ type: 'WATCH_REFRESH_BADGE' }, () => {
    void chrome.runtime.lastError;
  });
}

export function renderChangesBadge(): void {
  const badge = document.getElementById('changes-menu-badge');
  if (!badge) return;

  const count = Number(state.unseenChangesCount || 0);
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count <= 0);
}
