import { state } from '../state.js';
import { PAGE_SIZE } from '../constants.js';

export function areFiltersActive(): boolean {
  return (
    state.activeFilters.minScore > 0 ||
    state.activeFilters.maxScore < 100 ||
    state.activeFilters.persona !== '' ||
    state.activeFilters.status !== '' ||
    (state.activeFilters.searchQuery && state.activeFilters.searchQuery.length > 0) ||
    state.activeFilters.sort !== 'created_at_desc'
  );
}

export function updateFilterBanner(): void {
  const banner = document.getElementById('active-filter-banner');
  const text = document.getElementById('filter-banner-text');

  if (!banner || !text) return;

  const isFiltering = areFiltersActive();
  const isNoResults = state.totalFilteredCount === 0;

  if (isFiltering && !isNoResults) {
    const shownSoFar = Math.min(state.currentPage * PAGE_SIZE, state.totalFilteredCount);

    banner.classList.remove('hidden');
    text.textContent = formatResultsText(shownSoFar, state.totalFilteredCount);
  } else {
    banner.classList.add('hidden');
  }
}

export function formatResultsText(shown: number, total: number): string {
  if (total === 0) return '';

  if (total <= PAGE_SIZE) {
    return total === 1 ? '1 result found' : `${total} results found`;
  }

  const start = (state.currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(state.currentPage * PAGE_SIZE, total);

  return `Showing ${start}–${end} of ${total}`;
}
