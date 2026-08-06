import { QUOTA_TTL } from './constants.js';
import { supabase } from './supabase.js';
import { state } from './state.js';
import { API_BASE_URL } from '../config.js';
import {
  FALLBACK_DAILY_ANALYSES,
  FALLBACK_MAX_SAVED,
  FALLBACK_WATCH_LIMITS,
} from '../watch/plans.js';

interface QuotaResponse {
  plan: string;
  remaining_today: number;
  used_today: number;
  daily_limit: number;
  max_saved: number;
  total_saved: number;
  max_watched?: number;
  total_watched?: number;
  check_interval_hours?: number;
}

/**
 * Applied whenever the Worker is unreachable. These must match the Free plan,
 * otherwise an outage shows the wrong cap and blocks saving.
 */
function applyQuotaFallbacks(): void {
  state.currentPlan = state.currentPlan || 'free';
  state.remainingToday = null;
  state.usedToday = null;
  state.dailyLimitFromAPI = state.dailyLimitFromAPI ?? FALLBACK_DAILY_ANALYSES;
  state.maxSavedLimit = state.maxSavedLimit ?? FALLBACK_MAX_SAVED;
  state.totalSavedCount = state.totalSavedCount ?? 0;
  state.maxWatchedLimit = state.maxWatchedLimit ?? FALLBACK_WATCH_LIMITS.maxWatched;
  state.totalWatchedCount = state.totalWatchedCount ?? 0;
  state.checkIntervalHours = state.checkIntervalHours ?? FALLBACK_WATCH_LIMITS.checkIntervalHours;
}

/** "weekly" reads better than "every 168 hours" in a banner. */
export function formatCheckInterval(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return 'weekly';
  if (hours >= 168) return 'weekly';
  if (hours >= 48) return 'every 48h';
  if (hours >= 24) return 'daily';
  return `every ${Math.round(hours)}h`;
}

export async function loadQuotaFromAPI(force = false): Promise<void> {
  if (!force && Date.now() - state.lastQuotaFetch < QUOTA_TTL) return;
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return;
  state.lastQuotaFetch = Date.now();

  const jwt = data.session.access_token;

  try {
    const res = await fetch(`${API_BASE_URL}/quota`, {
      headers: { Authorization: `Bearer ${jwt}` },
      credentials: 'omit',
      mode: 'cors',
    });

    if (!res.ok) {
      console.warn('Quota fetch failed:', res.status);
      applyQuotaFallbacks();
      renderQuotaBanner();
      return;
    }

    const dataJson = (await res.json()) as QuotaResponse;

    if (dataJson.plan) {
      state.currentPlan = dataJson.plan;
      state.remainingToday = dataJson.remaining_today;
      state.usedToday = dataJson.used_today;
      state.dailyLimitFromAPI = dataJson.daily_limit;
      state.maxSavedLimit = dataJson.max_saved ?? 0;
      state.totalSavedCount = dataJson.total_saved ?? 0;
      state.maxWatchedLimit = dataJson.max_watched ?? FALLBACK_WATCH_LIMITS.maxWatched;
      state.totalWatchedCount = dataJson.total_watched ?? 0;
      state.checkIntervalHours =
        dataJson.check_interval_hours ?? FALLBACK_WATCH_LIMITS.checkIntervalHours;

      renderQuotaBanner();
    }
  } catch (e) {
    console.warn('Quota fetch failed', e);
    applyQuotaFallbacks();
    renderQuotaBanner();
  }
}

export function renderQuotaBanner(): void {
  const banner = document.getElementById('quota-banner');
  const text = document.getElementById('quota-text');
  const btn = document.getElementById('upgrade-btn');
  const badge = document.getElementById('plan-badge');
  const usageRing = document.getElementById('quota-usage-ring') as HTMLElement | null;
  const resetTooltip = document.getElementById('quota-reset-tooltip');

  if (badge && state.currentPlan) {
    badge.textContent = state.currentPlan.toUpperCase();
    badge.className = 'badge';
    badge.classList.add(`badge-${state.currentPlan.toLowerCase()}`);
  }

  if (!banner || !text || !btn) return;

  banner.classList.remove('hidden');
  const used = Number(state.usedToday ?? 0);
  const totalLimit = Math.max(1, Number(state.dailyLimitFromAPI ?? 0));
  const usedPercent = Math.max(0, Math.min(100, Math.round((used / totalLimit) * 100)));
  const usedDegrees = Math.round((usedPercent / 100) * 360);

  // Watched accounts come first: under a monitoring model that is the number
  // the user should see every time the panel opens.
  const watchedText = `${Number(state.totalWatchedCount ?? 0)} / ${Number(
    state.maxWatchedLimit ?? 0
  )} watched`;

  const savedText = `${watchedText} • ${Number(state.totalSavedCount ?? 0)} / ${Number(
    state.maxSavedLimit ?? 0
  )} saved`;

  if (state.remainingToday === null) {
    text.textContent = `Usage unavailable • ${savedText}`;
    if (usageRing) usageRing.style.setProperty('--progress-deg', '0deg');
    if (resetTooltip) {
      resetTooltip.textContent =
        `Watched accounts are re-checked ${formatCheckInterval(state.checkIntervalHours)}. ` +
        'Daily quota resets at 00:00 UTC';
    }
    btn.classList.add('hidden');
  } else if (Number(state.remainingToday ?? 0) > 0) {
    text.textContent = `${used} / ${totalLimit} prospects • ${savedText}`;
    if (usageRing) usageRing.style.setProperty('--progress-deg', `${usedDegrees}deg`);
    if (resetTooltip) {
      resetTooltip.textContent =
        `Watched accounts are re-checked ${formatCheckInterval(state.checkIntervalHours)}. ` +
        'Daily quota resets at 00:00 UTC';
    }

    if (state.currentPlan === 'team') {
      btn.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
      btn.textContent = 'Upgrade';
    }
  } else {
    text.textContent = `Daily limit reached • ${savedText}`;
    if (usageRing) usageRing.style.setProperty('--progress-deg', '360deg');
    if (resetTooltip) {
      resetTooltip.textContent =
        `Watched accounts are re-checked ${formatCheckInterval(state.checkIntervalHours)}. ` +
        'Daily quota resets at 00:00 UTC';
    }
    if (state.currentPlan === 'team') {
      btn.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
      btn.textContent = 'Upgrade';
    }
  }

  const quotaLeft = banner.querySelector('.quota-left') as HTMLElement | null;
  if (btn.classList.contains('hidden')) {
    banner.style.justifyContent = 'center';
    if (quotaLeft) quotaLeft.style.justifyContent = 'center';
  } else {
    banner.style.justifyContent = 'space-between';
    if (quotaLeft) quotaLeft.style.justifyContent = 'flex-start';
  }

  const batchMenuBtn = document.getElementById('menu-batch-analysis');
  if (batchMenuBtn) {
    const isFreePlan = (state.currentPlan || '').toLowerCase() === 'free';
    batchMenuBtn.style.display = isFreePlan ? 'none' : 'flex';
  }
}
