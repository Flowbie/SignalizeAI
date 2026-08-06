import type { FollowUpEmailsResult, OutreachAnglesResult } from './outreach-messages/types.js';

export interface PendingDelete {
  element: HTMLElement;
  finalize: () => Promise<void>;
}

export interface ExtractedMeta {
  title: string;
  description: string;
  url: string;
  domain: string;
}

export interface ExtractedEvidence {
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
}

export interface BestSalesPersona {
  persona: string;
  reason: string;
}

export interface RecommendedOutreach {
  goal: string;
  angle: string;
  message: string;
}

export interface Analysis {
  whatTheyDo: string;
  targetCustomer: string;
  valueProposition: string;
  salesAngle: string;
  salesReadinessScore: number;
  bestSalesPersona: BestSalesPersona;
  recommendedOutreach: RecommendedOutreach;
}

export interface ActiveFilters {
  minScore: number;
  maxScore: number;
  persona: string;
  status: string;
  searchQuery: string;
  sort: string;
}

export interface State {
  analysisTab: 'strategy' | 'outreach' | 'overview';
  lastContentHash: string | null;
  lastAnalysis: Analysis | null;
  lastExtractedMeta: ExtractedMeta | null;
  lastExtractedEvidence: ExtractedEvidence | null;
  lastAnalyzedDomain: string | null;
  forceRefresh: boolean;
  currentView: 'analysis' | 'saved' | 'batch' | 'changes' | 'profile' | 'settings' | null;
  selectionMode: boolean;
  lastSelectedIndex: number | null;
  selectedSavedIds: Set<string>;
  isRangeSelecting: boolean;
  isFinalizingDeletes: boolean;
  isUndoToastActive: boolean;
  pendingDeleteMap: Map<string, PendingDelete>;
  undoTimer: ReturnType<typeof setTimeout> | null;
  totalFilteredCount: number;
  currentPage: number;
  currentPlan: string | null;
  remainingToday: number | null;
  usedToday: number | null;
  maxSavedLimit: number;
  totalSavedCount: number;
  dailyLimitFromAPI: number;
  /** Watch caps and check frequency, from /quota. Frequency is the paid lever. */
  maxWatchedLimit: number;
  totalWatchedCount: number;
  checkIntervalHours: number;
  /** Undismissed change alerts, and how many of those the user has not seen. */
  unseenChangesCount: number;
  isUserInteracting: boolean;
  dropdownOpenedAt: number;
  isAnalysisLoading: boolean;
  lastQuotaFetch: number;
  lastAutoAnalyzeAt: number;
  activeFilters: ActiveFilters;
  outreachAngles: OutreachAnglesResult | null;
  outreachAnglesLoading: boolean;
  followUpEmails: FollowUpEmailsResult | null;
  followUpEmailsLoading: boolean;
  currentUserName: string;
}

export const state: State = {
  analysisTab: 'strategy',
  lastContentHash: null,
  lastAnalysis: null,
  lastExtractedMeta: null,
  lastExtractedEvidence: null,
  lastAnalyzedDomain: null,
  forceRefresh: false,
  currentView: 'analysis',
  selectionMode: false,
  lastSelectedIndex: null,
  selectedSavedIds: new Set(),
  isRangeSelecting: false,
  isFinalizingDeletes: false,
  isUndoToastActive: false,
  pendingDeleteMap: new Map(),
  undoTimer: null,
  totalFilteredCount: 0,
  currentPage: 1,
  currentPlan: 'free',
  remainingToday: null,
  usedToday: null,
  maxSavedLimit: 25,
  totalSavedCount: 0,
  dailyLimitFromAPI: 5,
  maxWatchedLimit: 3,
  totalWatchedCount: 0,
  checkIntervalHours: 168,
  unseenChangesCount: 0,
  isUserInteracting: false,
  dropdownOpenedAt: 0,
  isAnalysisLoading: false,
  lastQuotaFetch: 0,
  lastAutoAnalyzeAt: 0,
  activeFilters: {
    minScore: 0,
    maxScore: 100,
    persona: '',
    status: '',
    searchQuery: '',
    sort: 'created_at_desc',
  },
  outreachAngles: null,
  outreachAnglesLoading: false,
  followUpEmails: null,
  followUpEmailsLoading: false,
  currentUserName: '',
};
