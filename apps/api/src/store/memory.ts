import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_WORKSPACE_ID } from '../db/connection.js';
import { isZeroConfigured } from '../integrations/zero.js';
import { isUnifyGtmConfigured } from '../integrations/unifygtm.js';
import type { ExtractedSignal, AudienceMatch, ContentAssetResult, GrowthRecommendationResult } from '../data/demo.js';
import {
  DEMO_SOURCES,
  DEMO_SIGNALS,
  DEMO_AUDIENCES,
  DEMO_GTM_PLAYBOOKS,
  DEMO_CONTENT_ASSETS,
  DEMO_GROWTH_RECOMMENDATIONS,
  DEMO_ANALYTICS
} from '../data/demo.js';

export interface ProofSource {
  id: string;
  workspaceId: string;
  type: string;
  title: string;
  content: string;
  fileName?: string;
  status: string;
  createdAt: string;
}

export interface TrustSignal extends ExtractedSignal {
  id: string;
  workspaceId: string;
  sourceId?: string;
  createdAt: string;
}

export interface CrmSyncState {
  status: 'not_synced' | 'not_configured' | 'synced' | 'failed';
  zeroId?: string;
  zeroUrl?: string;
  error?: string;
  lastSyncedAt?: string;
}

export interface CrmEntry {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  status: string;
  conversionOutcome?: string;
  createdAt: string;
  zeroSync: CrmSyncState;
}

export interface FeedbackEntry {
  id: string;
  playbookId: string;
  actionIndex?: number;
  rating: 'helpful' | 'not_helpful';
  comment?: string;
  createdAt: string;
}

export interface GtmMetrics {
  playbooksGenerated: number;
  feedbackSubmitted: number;
  helpfulCount: number;
  notHelpfulCount: number;
  topPerformingSignals: Record<string, number>;
}

export interface Store {
  workspaceId: string;
  sources: ProofSource[];
  signals: TrustSignal[];
  audiences: (AudienceMatch & { id: string; trustSignalId?: string })[];
  playbooks: (typeof DEMO_GTM_PLAYBOOKS[number] & { id: string; feedback?: FeedbackEntry[] })[];
  contentAssets: (ContentAssetResult & { id: string; trustSignalId?: string })[];
  crmEntries: CrmEntry[];
  recommendations: (GrowthRecommendationResult & { id: string })[];
  feedback: FeedbackEntry[];
  gtmMetrics: GtmMetrics;
  settings: { demoMode: boolean; aiProvider: string; integrations: Record<string, boolean> };
}

const WORKSPACE_ID = DEFAULT_WORKSPACE_ID;

function initStore(): Store {
  const now = new Date().toISOString();
  const zeroConfigured = !!process.env.ZERO_API_KEY;
  const defaultSyncStatus: CrmSyncState = zeroConfigured ? { status: 'not_synced' } : { status: 'not_configured', error: 'Add ZERO_API_KEY and ZERO_API_URL to .env to sync.' };
  return {
    workspaceId: WORKSPACE_ID,
    sources: DEMO_SOURCES.map((s, i) => ({
      id: `source-${i + 1}`,
      workspaceId: WORKSPACE_ID,
      ...s,
      status: 'processed',
      createdAt: now
    })),
    signals: DEMO_SIGNALS.map((s, i) => ({
      id: `signal-${i + 1}`,
      workspaceId: WORKSPACE_ID,
      sourceId: `source-${(i % 5) + 1}`,
      ...s,
      createdAt: now
    })),
    audiences: DEMO_AUDIENCES.map((a, i) => ({
      id: `audience-${i + 1}`,
      trustSignalId: 'signal-2',
      ...a
    })),
    playbooks: DEMO_GTM_PLAYBOOKS.map((p, i) => ({
      id: `playbook-${i + 1}`,
      ...p
    })) as Store['playbooks'],
    contentAssets: DEMO_CONTENT_ASSETS.map((c, i) => ({
      id: `content-${i + 1}`,
      trustSignalId: `signal-${(i % 3) + 1}`,
      ...c
    })),
    crmEntries: [
      { id: 'crm-1', entityType: 'trust_signal', entityId: 'signal-1', title: '£40K Savings — Landing Page Hero', status: 'deployed', conversionOutcome: '+34% CVR', createdAt: now, zeroSync: { ...defaultSyncStatus } },
      { id: 'crm-2', entityType: 'content_asset', entityId: 'content-1', title: 'Founder LinkedIn Post', status: 'published', conversionOutcome: '2.4K impressions', createdAt: now, zeroSync: { ...defaultSyncStatus } },
      { id: 'crm-3', entityType: 'gtm_playbook', entityId: 'playbook-1', title: 'Recruitment ICP Outbound', status: 'active', conversionOutcome: '12 meetings booked', createdAt: now, zeroSync: { ...defaultSyncStatus } },
      { id: 'crm-4', entityType: 'trust_signal', entityId: 'signal-2', title: '12hrs/week — SDR Deck', status: 'active', createdAt: now, zeroSync: { ...defaultSyncStatus } },
      { id: 'crm-5', entityType: 'content_asset', entityId: 'content-3', title: 'TalentFlow Case Study', status: 'draft', createdAt: now, zeroSync: { ...defaultSyncStatus } }
    ],
    recommendations: DEMO_GROWTH_RECOMMENDATIONS.map((r, i) => ({
      id: `rec-${i + 1}`,
      ...r,
      proofSignalIds: [`signal-${i + 1}`]
    })),
    feedback: [],
    gtmMetrics: {
      playbooksGenerated: 0,
      feedbackSubmitted: 0,
      helpfulCount: 0,
      notHelpfulCount: 0,
      topPerformingSignals: {}
    },
    settings: {
      demoMode: true,
      aiProvider: 'demo',
      integrations: {
        unify: isUnifyGtmConfigured(),
        gtmengineer: true,
        faxxing: !!process.env.FAXXING_API_KEY,
        zero: isZeroConfigured(),
        lightfern: !!process.env.LIGHTFERN_API_KEY,
        scaile: !!process.env.SCAILE_API_KEY
      }
    }
  };
}

let store: Store = initStore();

export function getStore() {
  return store;
}

export function resetStore() {
  store = initStore();
  return store;
}

export function addSource(source: Omit<ProofSource, 'id' | 'createdAt'>) {
  const entry: ProofSource = {
    ...source,
    id: uuidv4(),
    createdAt: new Date().toISOString()
  };
  store.sources.unshift(entry);
  return entry;
}

export function addSignals(signals: Omit<TrustSignal, 'id' | 'createdAt'>[]) {
  const entries = signals.map((s) => ({
    ...s,
    id: uuidv4(),
    createdAt: new Date().toISOString()
  }));
  store.signals.unshift(...entries);
  return entries;
}

export function updateCrmEntryZeroSync(id: string, zeroSync: CrmSyncState) {
  const entry = store.crmEntries.find((item) => item.id === id);
  if (!entry) return undefined;
  entry.zeroSync = zeroSync;
  return entry;
}

export function addPlaybook(playbook: Omit<typeof DEMO_GTM_PLAYBOOKS[number] & { id?: string; feedback?: FeedbackEntry[] }, 'id'>) {
  const entry = {
    ...playbook,
    id: uuidv4(),
    feedback: []
  };
  store.playbooks.unshift(entry);
  store.gtmMetrics.playbooksGenerated++;
  return entry;
}

export function addFeedback(fb: Omit<FeedbackEntry, 'id' | 'createdAt'>) {
  const entry: FeedbackEntry = {
    ...fb,
    id: uuidv4(),
    createdAt: new Date().toISOString()
  };
  store.feedback.unshift(entry);
  store.gtmMetrics.feedbackSubmitted++;
  if (fb.rating === 'helpful') store.gtmMetrics.helpfulCount++;
  else store.gtmMetrics.notHelpfulCount++;

  const playbook = store.playbooks.find((p) => p.id === fb.playbookId);
  if (playbook) {
    if (!playbook.feedback) playbook.feedback = [];
    playbook.feedback.unshift(entry);
  }
  return entry;
}

export function getGtmMetrics(): GtmMetrics {
  return { ...store.gtmMetrics };
}

export { DEMO_ANALYTICS, WORKSPACE_ID };
