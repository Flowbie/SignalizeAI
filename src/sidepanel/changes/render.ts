import { state } from '../state.js';
import { showActionTooltip } from '../clipboard.js';
import { showToast } from '../toast.js';
import { formatCheckInterval } from '../quota.js';
import {
  dismissChange,
  fetchChanges,
  fetchSnapshotTimeline,
  markChangesSeen,
  type ProspectChange,
  type ProspectSnapshot,
} from './data.js';

const CHANGE_LABELS: Record<ProspectChange['change_type'], string> = {
  pricing: 'Pricing',
  hiring: 'Hiring',
  messaging: 'Messaging',
  new_page: 'New page',
};

export function escapeHtml(value: unknown = ''): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char] || char
  );
}

export function formatDetectedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';

  const days = Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncate(value: string | null | undefined, max = 220): string {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function buildChangeCard(change: ProspectChange): HTMLElement {
  const card = document.createElement('div');
  card.className = `change-card change-card--${change.severity}`;
  card.dataset.changeId = change.id;
  card.dataset.savedId = change.saved_analysis_id;

  // The suggested opener is model-written and may be missing when Groq failed.
  // The raw before/after is always shown, so a failed generation degrades to a
  // less pretty alert rather than to nothing.
  const opener = change.suggested_opener?.trim() || '';

  card.innerHTML = `
    <div class="change-card-header">
      <div class="change-card-heading">
        <span class="change-badge change-badge--${change.change_type}">
          ${CHANGE_LABELS[change.change_type] || 'Change'}
        </span>
        <span class="change-domain">${escapeHtml(change.domain)}</span>
      </div>
      <span class="change-date">${escapeHtml(formatDetectedAt(change.detected_at))}</span>
    </div>

    <p class="change-summary">${escapeHtml(change.summary || 'Something changed on this account.')}</p>

    <div class="change-diff">
      <div class="change-diff-row change-diff-row--before">
        <span class="change-diff-label">Before</span>
        <span class="change-diff-text">${escapeHtml(truncate(change.before_text))}</span>
      </div>
      <div class="change-diff-row change-diff-row--after">
        <span class="change-diff-label">After</span>
        <span class="change-diff-text">${escapeHtml(truncate(change.after_text))}</span>
      </div>
    </div>

    ${
      opener
        ? `<p class="change-opener">${escapeHtml(opener)}</p>`
        : '<p class="change-opener change-opener--missing">No opener generated. Copy the change details instead.</p>'
    }

    <div class="change-card-actions">
      <button class="change-copy-btn secondary-btn" type="button">Copy opener</button>
      <button class="change-timeline-btn secondary-btn" type="button">History</button>
      <button class="change-dismiss-btn secondary-btn" type="button">Dismiss</button>
    </div>

    <div class="change-timeline hidden"></div>
  `;

  const copyBtn = card.querySelector<HTMLButtonElement>('.change-copy-btn')!;
  const timelineBtn = card.querySelector<HTMLButtonElement>('.change-timeline-btn')!;
  const dismissBtn = card.querySelector<HTMLButtonElement>('.change-dismiss-btn')!;
  const timelineEl = card.querySelector<HTMLElement>('.change-timeline')!;

  copyBtn.addEventListener('click', async () => {
    const text =
      opener ||
      `${change.domain}: ${change.summary || 'change detected'}\n\nBefore: ${truncate(
        change.before_text,
        400
      )}\nAfter: ${truncate(change.after_text, 400)}`;

    try {
      await navigator.clipboard.writeText(text);
      showActionTooltip(copyBtn, opener ? 'Opener copied' : 'Change copied');
    } catch {
      showToast('Could not copy to clipboard.');
    }
  });

  timelineBtn.addEventListener('click', async () => {
    if (!timelineEl.classList.contains('hidden')) {
      timelineEl.classList.add('hidden');
      return;
    }

    timelineEl.classList.remove('hidden');
    timelineEl.innerHTML = '<p class="change-timeline-empty">Loading history…</p>';
    const snapshots = await fetchSnapshotTimeline(change.saved_analysis_id);
    renderTimelineInto(timelineEl, snapshots);
  });

  dismissBtn.addEventListener('click', async () => {
    dismissBtn.disabled = true;
    if (await dismissChange(change.id)) {
      card.remove();
      updateChangesEmptyState();
    } else {
      dismissBtn.disabled = false;
    }
  });

  return card;
}

export function renderTimelineInto(container: HTMLElement, snapshots: ProspectSnapshot[]): void {
  if (snapshots.length === 0) {
    container.innerHTML = '<p class="change-timeline-empty">No history captured yet.</p>';
    return;
  }

  const isFree = (state.currentPlan || 'free').toLowerCase() === 'free';
  // Free keeps the latest snapshot only. The archive is the thing that gets
  // more valuable over time, so it is the thing that is worth paying for.
  const visible = isFree ? snapshots.slice(0, 1) : snapshots;

  container.innerHTML = `
    <ul class="change-timeline-list">
      ${visible
        .map((snapshot) => {
          const failed = snapshot.fetch_status && snapshot.fetch_status !== 'ok';
          const detail = failed
            ? `Could not read the site (${escapeHtml(snapshot.fetch_status)})`
            : escapeHtml(truncate(snapshot.title || snapshot.meta_description, 90));

          return `
            <li class="change-timeline-item${failed ? ' change-timeline-item--failed' : ''}">
              <span class="change-timeline-date">${escapeHtml(
                new Date(snapshot.captured_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
              )}</span>
              <span class="change-timeline-detail">${detail}</span>
            </li>
          `;
        })
        .join('')}
    </ul>
    ${
      isFree && snapshots.length > 1
        ? `<p class="change-timeline-locked">${snapshots.length - 1} earlier snapshot${
            snapshots.length - 1 === 1 ? '' : 's'
          } stored. Upgrade to see the full history.</p>`
        : ''
    }
  `;
}

export function updateChangesEmptyState(): void {
  const list = document.getElementById('changes-list');
  const empty = document.getElementById('changes-empty');
  if (!list || !empty) return;

  const hasCards = list.querySelectorAll('.change-card').length > 0;
  empty.classList.toggle('hidden', hasCards);
}

function renderChangesMeta(): void {
  const meta = document.getElementById('changes-meta');
  if (!meta) return;

  meta.textContent =
    `${state.totalWatchedCount} of ${state.maxWatchedLimit} accounts watched • ` +
    `checked ${formatCheckInterval(state.checkIntervalHours)}`;
}

export async function loadChangesFeed(): Promise<void> {
  const list = document.getElementById('changes-list');
  const loading = document.getElementById('changes-loading');
  const empty = document.getElementById('changes-empty');

  if (list) list.innerHTML = '';
  loading?.classList.remove('hidden');
  empty?.classList.add('hidden');

  renderChangesMeta();

  const changes = await fetchChanges();

  loading?.classList.add('hidden');

  changes.forEach((change) => list?.appendChild(buildChangeCard(change)));
  updateChangesEmptyState();

  // Opening the feed is what "seen" means. Clears the action badge.
  const unseen = changes.filter((change) => !change.seen_at).map((change) => change.id);
  if (unseen.length > 0) {
    await markChangesSeen(unseen);
  }

  state.unseenChangesCount = 0;
  chrome.runtime.sendMessage({ type: 'WATCH_REFRESH_BADGE' }, () => {
    void chrome.runtime.lastError;
  });
}
