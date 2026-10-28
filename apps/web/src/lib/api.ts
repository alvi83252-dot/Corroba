const API_BASE = typeof window !== 'undefined' ? '' : (process.env.API_URL ?? 'http://localhost:3001');

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

export interface TrustSignal {
  id: string;
  quote: string;
  category: string;
  signalType: string;
  strength: number;
  proofScore: number;
  credibility: number;
  specificity: number;
  revenueImpact: number;
  emotionalImpact: number;
  conversionPotential: number;
  recommendedUses: string[];
  sourceId?: string;
  createdAt?: string;
}

export interface ProofSource {
  id: string;
  type: string;
  title: string;
  content: string;
  fileName?: string;
  status: string;
  createdAt: string;
}

export interface RagStatus {
  documents: number;
  chunks: number;
  unifyConfigured: boolean;
  unifyBaseUrl: string;
  embeddingProvider: 'voyage' | 'hash';
  sources?: Record<string, number>;
  demoDataSources?: number;
  demoGuidanceExamples?: number;
}

export interface DiscoveryRagMeta {
  ragUsed: boolean;
  chunksRetrieved: number;
  demoDataMatched: boolean;
  indexedChunks: number;
  mode?: 'paste' | 'upload' | 'demo';
  chunks: Array<{ id: string; title: string; text: string; score: number; source: string }>;
}

export interface DemoDataSummary {
  dir: string;
  sources: Array<{ id: string; title: string; type: string; fileName: string }>;
  guidanceExamples: number;
}

export interface UploadFileMeta {
  name: string;
  size: number;
  parser: string;
}

export interface FaxxingSocialMatch {
  platform: string;
  accountName: string;
  handle: string;
  profileUrl: string;
  postUrl: string;
  snippet: string;
  postedAt: string;
  engagement: { likes: number; comments: number; shares: number };
  matchScore: number;
  verified: boolean;
}

export interface FaxxingValidationResult {
  quote: string;
  overallScore: number;
  credibility: number;
  socialVerified: boolean;
  verificationStatus: 'verified' | 'partial' | 'unverified';
  platformsScanned: string[];
  matches: FaxxingSocialMatch[];
  poweredBy: string;
  summary: string;
  scannedAt: string;
}

export interface RagIngestResult {
  documentsIngested: number;
  chunksIndexed: number;
  source: 'unify' | 'demo';
}

export interface RagQueryResult {
  query: string;
  answer: string;
  chunks: Array<{ id: string; title: string; text: string; score: number; source: string }>;
  source: 'unify' | 'demo' | 'local';
}

export interface UnifyNotificationEvent {
  id: string;
  event: string;
  conversationId: string;
  message: string;
  timestamp: string;
  receivedAt: string;
  source?: 'unifygtm' | 'simulated';
  verified?: boolean;
}

export interface UnifySubscription {
  subscriptionId: string;
  topic: string;
  subjectFilter: string;
  webhookUrl: string;
  createdAt: string;
  source?: 'unifygtm' | 'simulated';
}

export interface UnifyNotificationsStatus {
  service: string;
  mode: 'live' | 'simulated' | string;
  provider: string;
  unifygtm?: {
    configured: boolean;
    dataApiUrl: string;
    proofObject: string;
  };
  subscriptions: number;
  eventsReceived: number;
  endpoints: Record<string, string>;
}

export interface UnifyGtmStatus {
  service: string;
  mode: 'live' | 'demo' | string;
  provider: string;
  configured: boolean;
  dataApiUrl: string;
  proofObject: string;
  companyDomain?: string;
  companyName?: string;
}

export interface ZeroStatus {
  service: string;
  mode: 'live' | 'demo' | string;
  provider: string;
  configured: boolean;
  recordsUrl: string;
  database: {
    configured: boolean;
    connected: boolean;
    url?: string;
  };
}

export interface ZeroSyncResponse {
  synced: boolean;
  mode: string;
  zeroId?: string;
  error?: string;
  stored?: unknown;
}

export interface DashboardData {
  workspaceId: string;
  stats: {
    totalProofSources: number;
    trustSignalsFound: number;
    avgProofScore: number;
    assetsGenerated: number;
    conversionLift: number;
  };
  topSignals: TrustSignal[];
  recentSources: ProofSource[];
  integrationStatus: Record<string, boolean>;
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
  zeroSync: CrmSyncState;
}

export const api = {
  getDashboard: () => request<DashboardData>('/api/dashboard'),
  getSources: () => request<ProofSource[]>('/api/sources'),
  getTrustSignals: () => request<TrustSignal[]>('/api/trust-signals'),
  getRankings: () => request<(TrustSignal & { rank: number })[]>('/api/rankings'),
  getAudiences: () => request<unknown[]>('/api/audiences'),
  expandAudience: (proofQuote: string) =>
    request<{ audiences: unknown[]; poweredBy: string; ragContext?: RagQueryResult }>('/api/audiences/expand', {
      method: 'POST',
      body: JSON.stringify({ proofQuote })
    }),
  getRagStatus: () => request<RagStatus>('/api/rag/status'),
  ingestRag: (force = false) =>
    request<RagIngestResult>('/api/rag/ingest', { method: 'POST', body: JSON.stringify({ force }) }),
  queryRag: (query: string, topK = 5) =>
    request<RagQueryResult>('/api/rag/query', { method: 'POST', body: JSON.stringify({ query, topK }) }),
  getUnifyConversations: () => request<{ conversations: unknown[]; source: string; total: number }>('/api/unify/conversations'),
  getUnifyGtmStatus: () => request<UnifyGtmStatus>('/api/unify/status'),
  syncUnifyGtmSignals: () =>
    request<{ synced: number; total: number; results: unknown[] }>('/api/unify/sync-signals', { method: 'POST' }),
  getUnifyNotificationsStatus: () => request<UnifyNotificationsStatus>('/api/unify/notifications/status'),
  getUnifySubscriptions: () => request<UnifySubscription[]>('/api/unify/notifications/subscriptions'),
  getUnifyNotificationEvents: () => request<UnifyNotificationEvent[]>('/api/unify/notifications/events'),
  subscribeUnifyNotifications: (data: { topic: string; subjectFilter: string; webhookUrl: string }) =>
    request<{ status: string; subscriptionId: string; topic: string; subjectFilter: string; webhookUrl: string }>(
      '/api/unify/notifications/subscribe',
      { method: 'POST', body: JSON.stringify(data) }
    ),
  testUnifyNotification: (data: { event: string; conversationId: string; message: string }) =>
    request<{ status: string; subscriptionsNotified: number; mode: string; note?: string }>('/api/unify/notifications/test', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getGtmPlaybooks: () => request<{ playbooks: unknown[]; metrics: unknown }>('/api/gtm-playbooks'),
  generateGtm: () => request<{ playbooks: unknown[]; poweredBy: string }>('/api/gtmengineer/generate', { method: 'POST' }),
  generateGtmFromSignals: () =>
    request<{ playbook: unknown; signalsUsed: unknown[]; metrics: unknown; poweredBy: string }>('/api/gtm/generate', { method: 'POST' }),
  submitGtmFeedback: (data: { playbookId: string; actionIndex?: number; rating: 'helpful' | 'not_helpful'; comment?: string }) =>
    request<{ feedback: unknown; metrics: unknown }>('/api/gtm/feedback', { method: 'POST', body: JSON.stringify(data) }),
  getGtmMetrics: () => request<unknown>('/api/gtm/metrics'),
  getContent: () => request<unknown[]>('/api/content'),
  generateContent: (signalId: string) =>
    request<{ assets: unknown[]; poweredBy: string }>('/api/content/generate', {
      method: 'POST',
      body: JSON.stringify({ signalId })
    }),
  getCrm: () => request<CrmEntry[]>('/api/crm'),
  getZeroStatus: () => request<ZeroStatus>('/api/crm/status'),
  syncCrmEntry: (id: string) =>
    request<{ entry: CrmEntry; result: CrmSyncState & { synced: boolean; mode: string } }>(`/api/crm/sync/${id}`, {
      method: 'POST'
    }),
  syncAllCrmToZero: () =>
    request<{ synced: number; total: number; results: unknown[] }>('/api/crm/sync-all', { method: 'POST' }),
  getGrowth: () => request<unknown[]>('/api/growth'),
  analyzeGrowth: () => request<{ recommendations: unknown[]; poweredBy: string }>('/api/growth/analyze', { method: 'POST' }),
  getAnalytics: () => request<unknown>('/api/analytics'),
  getSettings: () => request<unknown>('/api/settings'),
  updateSettings: (data: unknown) =>
    request('/api/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  submitText: (content: string, title?: string, type?: string) =>
    request<{ source: ProofSource; signals: TrustSignal[]; count: number; rag?: DiscoveryRagMeta }>('/api/sources/text', {
      method: 'POST',
      body: JSON.stringify({ content, title, type })
    }),
  discoverDemo: () =>
    request<{ source: ProofSource; signals: TrustSignal[]; count: number; rag?: DiscoveryRagMeta }>('/api/discovery/demo', {
      method: 'POST'
    }),
  uploadFile: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ source: ProofSource; signals: TrustSignal[]; count: number; rag?: DiscoveryRagMeta; file?: UploadFileMeta; warnings?: string[] }>('/api/sources/upload', {
      method: 'POST',
      body: form
    });
  },
  getFaxxingStatus: () => request<{ service: string; mode: string; endpoint: string; platforms: string[] }>('/api/faxxing/status'),
  validateWithFaxxing: (quote: string, signalId?: string) =>
    request<FaxxingValidationResult>('/api/faxxing/validate', {
      method: 'POST',
      body: JSON.stringify({ quote, signalId })
    }),
  getSupportedTypes: () => request<{ uploads: Record<string, { ext: string; description: string }>; pasteTypes: string[] }>('/api/rag/supported-types'),
  getDemoData: () => request<DemoDataSummary>('/api/rag/demo-data'),
  getSampleDatasets: () => request<{ id: string; name: string; type: string; content: string }[]>('/api/demo/sample-datasets'),
  resetDemo: () => request('/api/demo/reset', { method: 'POST' }),
  getUnifyAnalyticsStatus: () =>
    request<{ service: string; mode: 'live' | 'simulated'; provider: string; baseUrl: string; origin: string; writeKeyConfigured: boolean; eventsLogged: number; eventTypes: string[] }>(
      '/api/unify/analytics/status'
    ),
  getUnifyAnalyticsEvents: () =>
    request<Array<{ id: string; type: string; name?: string; visitorId: string; mode: 'live' | 'simulated'; ok: boolean; status?: number; error?: string; sentAt: string }>>(
      '/api/unify/analytics/events'
    ),
  trackUnifyEvent: (name: string, properties?: Record<string, unknown>) =>
    request<{ id: string; ok: boolean; mode: 'live' | 'simulated' }>('/api/unify/analytics/track', {
      method: 'POST',
      body: JSON.stringify({ name, properties })
    })
};
