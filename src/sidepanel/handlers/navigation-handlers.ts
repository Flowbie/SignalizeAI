import { navigateTo } from '../ui.js';
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { buildCopyText, copyAnalysisText } from '../clipboard.js';
import { loadSettings } from '../settings.js';
import { WEBSITE_BASE_URL } from '../../config.js';
import { showToast } from '../toast.js';
import { loadChangesFeed } from '../changes/render.js';

export function setupNavigationHandlers(): void {
  const dropdownHeader = document.getElementById('dropdown-header');
  const dropdownCard = document.querySelector<HTMLElement>('.dropdown-card');

  if (dropdownHeader && dropdownCard) {
    dropdownHeader.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();

      const isOpening = !dropdownCard.classList.contains('expanded');

      if (isOpening) {
        state.dropdownOpenedAt = Date.now();
        state.isUserInteracting = true;
      }

      dropdownCard.classList.toggle('expanded');
    });
  }

  const menuLists = document.querySelectorAll<HTMLUListElement>('.menu-list');
  menuLists.forEach((list) => {
    const glider = document.createElement('li');
    glider.className = 'menu-glider';
    list.appendChild(glider);

    list.addEventListener('pointermove', (e: PointerEvent) => {
      const target = (e.target as HTMLElement).closest('.menu-item') as HTMLElement;
      if (!target) {
        glider.style.opacity = '0';
        return;
      }
      glider.style.opacity = '1';
      glider.style.transform = `translateY(${target.offsetTop}px)`;
      glider.style.height = `${target.offsetHeight}px`;
    });

    list.addEventListener('pointerleave', () => {
      glider.style.opacity = '0';
    });
  });

  const homeTitle = document.querySelector<HTMLElement>('#welcome-view .user-name-text');

  homeTitle?.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    navigateTo('analysis');
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!dropdownCard) return;
    if (state.isAnalysisLoading) return;

    if (Date.now() - state.dropdownOpenedAt < 150) return;

    if (dropdownCard.classList.contains('expanded') && !dropdownCard.contains(e.target as Node)) {
      dropdownCard.classList.remove('expanded');
      state.isUserInteracting = false;
    }
  });

  const dropdownMenu = document.getElementById('menu-saved-analyses');

  dropdownMenu?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    navigateTo('saved');
  });

  const changesMenu = document.getElementById('menu-changes');

  changesMenu?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    navigateTo('changes');
  });

  document.getElementById('changes-go-saved')?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    navigateTo('saved');
  });

  const checkNowBtn = document.getElementById('changes-check-now') as HTMLButtonElement | null;

  checkNowBtn?.addEventListener('click', () => {
    checkNowBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'WATCH_RUN_SWEEP' }, (response) => {
      void chrome.runtime.lastError;
      checkNowBtn.disabled = false;

      const result = response?.result;
      if (!response?.ok) {
        showToast('Could not check accounts right now.');
        return;
      }
      if (result?.skipped) {
        showToast(`Check skipped: ${result.skipped}.`);
        return;
      }
      if (!result?.checked) {
        showToast('No accounts are due for a check yet.');
        return;
      }

      if (result.changesDetected > 0) {
        showToast(
          `Checked ${result.checked} account(s), ${result.changesDetected} change(s) found.`
        );
      } else if (result.baselines > 0) {
        // First check of an account can only record a starting point.
        showToast(
          `Baseline saved for ${result.baselines} account(s). Changes are reported from the next check.`
        );
      } else {
        showToast(`Checked ${result.checked} account(s), nothing changed.`);
      }
      void loadChangesFeed();
    });
  });

  const batchMenu = document.getElementById('menu-batch-analysis');

  batchMenu?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    navigateTo('batch');
  });

  const subscriptionMenu = document.getElementById('menu-subscription');

  subscriptionMenu?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${WEBSITE_BASE_URL}/pricing` });
  });

  const profileMenuItem = document.getElementById('menu-profile');

  profileMenuItem?.addEventListener('click', async (e: MouseEvent) => {
    e.preventDefault();
    navigateTo('profile');

    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;

    if (user) {
      const profileNameEl = document.getElementById('profile-name');
      const profileEmailEl = document.getElementById('profile-email');

      if (profileNameEl) {
        profileNameEl.textContent = user.user_metadata?.full_name || '—';
      }

      if (profileEmailEl) {
        profileEmailEl.textContent = user.email || '—';
      }
    }
  });

  const copyBtn = document.getElementById('copyButton');

  copyBtn?.addEventListener('click', async () => {
    const settings = await loadSettings();
    const formatLabel = settings.copyFormat === 'short' ? 'short' : 'full';

    const text = await buildCopyText();
    copyAnalysisText(text, copyBtn, formatLabel);
  });
}
