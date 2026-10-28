import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from 'hono';
import { getStore, addSource, addSignals, DEMO_ANALYTICS, resetStore, WORKSPACE_ID, updateCrmEntryZeroSync, addPlaybook, addFeedback, getGtmMetrics } from '../store/memory.js';
import type { CrmEntry } from '../store/memory.js';
import { getZeroSyncStatesForEntries, saveZeroSyncResult } from '../db/zeroSync.js';
import { parseFileContent, validateUploadFile, FileParseError } from '../ai/file-parser.js';
import { getZeroSyncStatesForEntries, saveZeroSyncResult } from '../db/zeroSync.js';
import {
  expandAudienceWithContext,
  generateGtmSystem,
  amplifyProof,
  syncToZero,
  getGrowthRecommendations,
  validateProof,
  isUnifyLive
} from '../integrations/sponsors.js';
import {
  ingestUnifyConversations,
  ragQuery,
  getRagStatus,
  discoverProofWithRag,
  discoverFromDemoData,
  getDemoDataSummary
} from '../rag/pipeline.js';
import { SUPPORTED_UPLOAD_TYPES, SUPPORTED_PASTE_TYPES } from '../rag/supported-types.js';
import { loadDemoSources } from '../rag/demo-data-loader.js';
import { cleanTrustSignals } from '../utils/signals.js';
import { resetUnifyNotifications } from '../integrations/unify-notifications.js';
import { fetchUnifyConversations, getUnifyGtmStatus, listUnifyGtmObjects, syncTrustSignalsToUnifyGtm } from '../integrations/unify.js';
import { validateProofOnSocialMedia, getFaxxingStatus } from '../integrations/faxxing.js';
import { getZeroStatus, isDatabaseConnected } from '../integrations/zero.js';
import unifyNotificationsRoutes from './unify-notifications.js';
import unifyAnalyticsRoutes from './unify-analytics.js';
import { emitProofEvent } from '../integrations/unify-analytics.js';

const app = new Hono();
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();
const DB_REQUESTS_PER_SECOND = Math.max(1, Number(process.env.DB_REQUESTS_PER_SECOND ?? 10));

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-proofloop-api-key']
  })
);

function getClientId(c: Context) {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-real-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local'
  );
}

app.use('/api/*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();

  const now = Date.now();
  const clientId = getClientId(c);
  const bucket = rateLimitBuckets.get(clientId);

  if (!bucket || now - bucket.windowStart >= 1000) {
    rateLimitBuckets.set(clientId, { count: 1, windowStart: now });
    c.header('X-RateLimit-Limit', String(DB_REQUESTS_PER_SECOND));
    c.header('X-RateLimit-Remaining', String(DB_REQUESTS_PER_SECOND - 1));
    return next();
  }

  if (bucket.count >= DB_REQUESTS_PER_SECOND) {
    c.header('Retry-After', '1');
    c.header('X-RateLimit-Limit', String(DB_REQUESTS_PER_SECOND));
    c.header('X-RateLimit-Remaining', '0');
    return c.json({ error: 'Too many database requests. Please retry in a second.' }, 429);
  }

  bucket.count += 1;
  c.header('X-RateLimit-Limit', String(DB_REQUESTS_PER_SECOND));
  c.header('X-RateLimit-Remaining', String(Math.max(0, DB_REQUESTS_PER_SECOND - bucket.count)));
  return next();
});

function resolveCrmEntity(entry: CrmEntry): Record<string, unknown> | undefined {
  const store = getStore();
  switch (entry.entityType) {
    case 'trust_signal':
      return store.signals.find((signal) => signal.id === entry.entityId) as Record<string, unknown> | undefined;
    case 'content_asset':
      return store.contentAssets.find((asset) => asset.id === entry.entityId) as Record<string, unknown> | undefined;
    case 'gtm_playbook':
      return store.playbooks.find((playbook) => playbook.id === entry.entityId) as Record<string, unknown> | undefined;
    case 'growth_recommendation':
      return store.recommendations.find((recommendation) => recommendation.id === entry.entityId) as Record<string, unknown> | undefined;
    case 'proof_source':
      return store.sources.find((source) => source.id === entry.entityId) as Record<string, unknown> | undefined;
    default:
      return undefined;
  }
}

async function syncCrmEntryToZero(entry: CrmEntry) {
  const entity = resolveCrmEntity(entry);
  if (!entity) {
    return { entry, result: null, error: `Linked ${entry.entityType} record not found` };
  }

  const syncInput = {
    type: entry.entityType,
    workspaceId: WORKSPACE_ID,
    entityId: entry.entityId,
    title: entry.title,
    entity,
    crmEntry: entry as unknown as Record<string, unknown>
  };

  const result = await syncToZero(syncInput);
  const persistedSync = await saveZeroSyncResult(syncInput, result);
  const updated = updateCrmEntryZeroSync(entry.id, {
    status: persistedSync?.status ?? result.status,
    zeroId: persistedSync?.zeroId ?? result.zeroId,
    zeroUrl: persistedSync?.zeroUrl ?? result.zeroUrl,
    error: persistedSync?.error ?? result.error,
    lastSyncedAt: persistedSync?.lastSyncedAt ?? result.lastSyncedAt
  });

  return { entry: updated ?? entry, result, error: undefined };
}

app.get('/health', (c) => c.json({ status: 'ok', service: 'proofloop-api', demo: true }));

app.get('/api/dashboard', (c) => {
  const store = getStore();
  const topSignals = [...store.signals].sort((a, b) => b.proofScore - a.proofScore).slice(0, 5);
  return c.json({
    workspaceId: store.workspaceId,
    stats: DEMO_ANALYTICS.overview,
    topSignals,
    recentSources: store.sources.slice(0, 5),
    integrationStatus: store.settings.integrations
  });
});

app.get('/api/sources', (c) => c.json(getStore().sources));

app.post('/api/sources/text', async (c) => {
  const body = await c.req.json<{ content: string; title?: string; type?: string }>();
  if (!body.content?.trim()) return c.json({ error: 'Content is required' }, 400);

  const source = addSource({
    workspaceId: WORKSPACE_ID,
    type: body.type ?? 'paste',
    title: body.title ?? 'Pasted Content',
    content: body.content,
    status: 'processing'
  });

  const discovery = await discoverProofWithRag(body.content, {
    sourceId: source.id,
    title: source.title,
    type: source.type
  });
  const validated = await Promise.all(discovery.signals.map((s) => validateProof(s)));
  const signals = addSignals(
    validated.map((s) => ({ workspaceId: WORKSPACE_ID, sourceId: source.id, ...s }))
  );

  source.status = 'processed';
  await syncToZero({
    type: 'source',
    workspaceId: WORKSPACE_ID,
    entityId: source.id,
    title: source.title,
    source: source as unknown as Record<string, unknown>,
    signals: signals as unknown as Record<string, unknown>[]
  });

  emitProofEvent(
    'Proof Discovered',
    { sourceId: source.id, sourceType: source.type, signalCount: signals.length, topSignalType: signals[0]?.signalType, topProofScore: signals[0]?.proofScore },
    WORKSPACE_ID
  );

  return c.json({ source, signals, count: signals.length, rag: discovery });
});

app.post('/api/sources/upload', async (c) => {
  try {
    const form = await c.req.parseBody();
    const file = form['file'];
    if (!file || !(file instanceof File)) return c.json({ error: 'File is required' }, 400);

    validateUploadFile(file.name, file.size);

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseFileContent(buffer, file.name);

    if (!parsed.text.trim()) {
      return c.json({
        error: 'No readable text found in file. Try a text-based PDF, .txt, or .csv with customer quotes.',
        warnings: parsed.warnings
      }, 422);
    }

    const source = addSource({
      workspaceId: WORKSPACE_ID,
      type: file.name.split('.').pop()?.toLowerCase() ?? 'file',
      title: file.name,
      content: parsed.text,
      fileName: file.name,
      status: 'processing'
    });

    const discovery = await discoverProofWithRag(parsed.text, {
      sourceId: source.id,
      title: source.title,
      type: source.type
    });
    const validated = await Promise.all(discovery.signals.map((s) => validateProof(s)));
    const signals = addSignals(
      validated.map((s) => ({ workspaceId: WORKSPACE_ID, sourceId: source.id, ...s }))
    );

    source.status = 'processed';
    return c.json({
      source,
      signals,
      count: signals.length,
      rag: discovery,
      file: { name: file.name, size: file.size, parser: parsed.parser },
      warnings: parsed.warnings
    });
  } catch (e) {
    const message = e instanceof FileParseError || e instanceof Error ? e.message : 'Upload failed';
    const status = e instanceof FileParseError ? 400 : 500;
    console.error('[upload]', message);
    return c.json({ error: message }, status);
  }
});

app.post('/api/discovery/demo', async (c) => {
  const discovery = await discoverFromDemoData();
  const source = addSource({
    workspaceId: WORKSPACE_ID,
    type: 'demo',
    title: 'Demo Data Scan',
    content: 'Auto-discovered from demo-data folder',
    status: 'processing'
  });
  const validated = await Promise.all(discovery.signals.map((s) => validateProof(s)));
  const signals = addSignals(
    validated.map((s) => ({ workspaceId: WORKSPACE_ID, sourceId: source.id, ...s }))
  );
  source.status = 'processed';
  emitProofEvent(
    'Proof Discovered',
    { sourceId: source.id, sourceType: 'demo', signalCount: signals.length, topSignalType: signals[0]?.signalType, topProofScore: signals[0]?.proofScore },
    WORKSPACE_ID
  );
  return c.json({ source, signals, count: signals.length, rag: discovery });
});

app.post('/api/discovery/run', async (c) => {
  const body = await c.req.json<{ content: string }>();
  const discovery = await discoverProofWithRag(body.content ?? '', {
    sourceId: `temp-${Date.now()}`,
    title: 'Discovery Run',
    type: 'paste'
  });
  const validated = await Promise.all(discovery.signals.map((s) => validateProof(s)));
  return c.json({ signals: validated, rag: discovery });
});

app.get('/api/trust-signals', (c) => {
  const store = getStore();
  return c.json(cleanTrustSignals([...store.signals].sort((a, b) => b.proofScore - a.proofScore)));
});

app.get('/api/trust-signals/:id', (c) => {
  const signal = getStore().signals.find((s) => s.id === c.req.param('id'));
  if (!signal) return c.json({ error: 'Not found' }, 404);
  return c.json(signal);
});

app.get('/api/rankings', (c) => {
  const store = getStore();
  const ranked = [...store.signals]
    .sort((a, b) => b.proofScore - a.proofScore)
    .map((s, i) => ({ rank: i + 1, ...s }));
  return c.json(ranked);
});

app.get('/api/audiences', (c) => c.json(getStore().audiences));

app.post('/api/audiences/expand', async (c) => {
  const body = await c.req.json<{ proofQuote: string; signalId?: string }>().catch(() => ({ proofQuote: '' }));
  if (!body.proofQuote?.trim()) return c.json({ error: 'proofQuote is required' }, 400);
  const { audiences, ragContext } = await expandAudienceWithContext(body.proofQuote);
  return c.json({
    audiences,
    ragContext,
    poweredBy: isUnifyLive() ? 'unify' : ragContext.source === 'demo' ? 'demo' : 'rag'
  });
});

app.get('/api/rag/status', (c) => c.json(getRagStatus()));

app.post('/api/rag/ingest', async (c) => {
  const body = await c.req.json<{ force?: boolean }>().catch(() => ({ force: false }));
  const result = await ingestUnifyConversations(body.force ?? false);
  return c.json(result);
});

app.post('/api/rag/query', async (c) => {
  const body = await c.req.json<{ query: string; topK?: number }>();
  if (!body.query?.trim()) return c.json({ error: 'Query is required' }, 400);
  const result = await ragQuery(body.query, body.topK ?? 5);
  return c.json(result);
});

app.get('/api/unify/conversations', async (c) => {
  try {
    const data = await fetchUnifyConversations();
    return c.json(data);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Failed to fetch conversations' }, 502);
  }
});

app.get('/api/unify/status', (c) => c.json(getUnifyGtmStatus()));

app.get('/api/unify/objects', async (c) => c.json(await listUnifyGtmObjects()));

app.post('/api/unify/sync-signals', async (c) => {
  const store = getStore();
  const signals = [...store.signals].sort((a, b) => b.proofScore - a.proofScore).slice(0, 10);
  const result = await syncTrustSignalsToUnifyGtm(signals);
  return c.json(result);
});

app.route('/api/unify/notifications', unifyNotificationsRoutes);

/** Unify GTM — Analytics API (intent events: page/track/identify) */
app.route('/api/unify/analytics', unifyAnalyticsRoutes);

app.get('/api/rag/supported-types', (c) =>
  c.json({ uploads: SUPPORTED_UPLOAD_TYPES, pasteTypes: SUPPORTED_PASTE_TYPES })
);

app.get('/api/rag/demo-data', (c) => c.json(getDemoDataSummary()));

app.get('/api/faxxing/status', (c) => c.json(getFaxxingStatus()));

app.post('/api/faxxing/validate', async (c) => {
  const body = await c.req.json<{ quote: string; signalId?: string }>();
  if (!body.quote?.trim()) return c.json({ error: 'quote is required' }, 400);
  const result = await validateProofOnSocialMedia(body.quote.trim());
  return c.json(result);
});

app.get('/api/gtm-playbooks', (c) => c.json({ playbooks: getStore().playbooks, metrics: getGtmMetrics() }));

app.post('/api/gtmengineer/generate', async (c) => {
  const store = getStore();
  const playbooks = await generateGtmSystem(store.signals.slice(0, 5));
  const saved = playbooks.map((p) => addPlaybook(p));
  const gtmLive = Boolean(process.env.GTMENGINEER_API_KEY && process.env.GTMENGINEER_API_URL);
  return c.json({
    playbooks: saved,
    poweredBy: gtmLive ? 'gtmengineer.dev' : 'simulated',
    message: gtmLive
      ? 'Generated via GTMengineer.dev'
      : 'Simulated GTM System Generator — GTMengineer.dev integration pending'
  });
});

app.post('/api/gtm/generate', async (c) => {
  const store = getStore();
  const topSignals = [...store.signals].sort((a, b) => b.proofScore - a.proofScore).slice(0, 3);

  const recs = await getGrowthRecommendations(topSignals);
  const generated = await generateGtmSystem(topSignals);

  const nextActions = (recs ?? []).slice(0, 3).map((r) => ({
    action: r.title,
    impact: r.priority === 'high' ? 'High' : r.priority === 'medium' ? 'Medium' : 'Low',
    effort: r.effort <= 25 ? 'Low' : r.effort <= 50 ? 'Medium' : 'High',
    source: process.env.SCAILE_API_KEY ? 'Scaile' : 'GTM System'
  }));

  const playbook = {
    ...generated[0],
    content: {
      ...generated[0].content,
      nextActions: [...nextActions, ...generated[0].content.nextActions.slice(0, 1)]
    }
  };

  const saved = addPlaybook(playbook);
  emitProofEvent(
    'GTM System Generated',
    { playbookId: saved.id, signalsUsed: topSignals.length, topSignalType: topSignals[0]?.signalType },
    WORKSPACE_ID
  );
  return c.json({
    playbook: saved,
    signalsUsed: topSignals.map((s) => ({ id: s.id, quote: s.quote, proofScore: s.proofScore, signalType: s.signalType })),
    metrics: getGtmMetrics(),
    poweredBy: process.env.SCAILE_API_KEY ? 'scaile' : 'demo'
  });
});

app.post('/api/gtm/feedback', async (c) => {
  const body = await c.req.json<{ playbookId: string; actionIndex?: number; rating: 'helpful' | 'not_helpful'; comment?: string }>();
  if (!body.playbookId || !body.rating) return c.json({ error: 'playbookId and rating are required' }, 400);
  const entry = addFeedback({
    playbookId: body.playbookId,
    actionIndex: body.actionIndex,
    rating: body.rating,
    comment: body.comment
  });
  return c.json({ feedback: entry, metrics: getGtmMetrics() });
});

app.get('/api/gtm/metrics', (c) => c.json(getGtmMetrics()));

app.get('/api/content', (c) => c.json(getStore().contentAssets));

app.post('/api/content/generate', async (c) => {
  const body = await c.req.json<{ signalId: string }>();
  const signal = getStore().signals.find((s) => s.id === body.signalId);
  if (!signal) return c.json({ error: 'Signal not found' }, 404);

  const assets = await amplifyProof(signal);
  return c.json({
    assets,
    poweredBy: process.env.FAXXING_API_KEY ? 'faxxing' : 'demo'
  });
});

app.get('/api/crm', async (c) => {
  const entries = getStore().crmEntries;
  const persistedEntries = await getZeroSyncStatesForEntries(entries, WORKSPACE_ID);
  return c.json(persistedEntries ?? entries);
});

app.get('/api/crm/status', async (c) => {
  return c.json(await getZeroStatus(await isDatabaseConnected()));
});

app.post('/api/crm/sync/:id', async (c) => {
  const entry = getStore().crmEntries.find((item) => item.id === c.req.param('id'));
  if (!entry) return c.json({ error: 'CRM entry not found' }, 404);

  const { entry: updated, result, error } = await syncCrmEntryToZero(entry);
  if (!result) return c.json({ error }, 404);

  return c.json({ result, entry: updated });
});

app.post('/api/crm/sync-all', async (c) => {
  const store = getStore();
  const results = [];

  for (const entry of store.crmEntries) {
    const { entry: updated, result, error } = await syncCrmEntryToZero(entry);
    results.push({
      entityId: entry.entityId,
      synced: result?.synced ?? false,
      status: result?.status,
      error: error ?? result?.error,
      entry: updated
    });
  }

  const synced = results.filter((r) => r.synced).length;
  return c.json({ synced, total: results.length, results });
});

app.get('/api/growth', (c) => c.json(getStore().recommendations));

app.post('/api/growth/analyze', async (c) => {
  const store = getStore();
  const recommendations = await getGrowthRecommendations(store.signals);
  return c.json({
    recommendations,
    poweredBy: process.env.SCAILE_API_KEY ? 'scaile' : 'demo'
  });
});

app.get('/api/analytics', (c) => c.json(DEMO_ANALYTICS));

app.get('/api/settings', (c) => c.json(getStore().settings));

app.patch('/api/settings', async (c) => {
  const body = await c.req.json<{ demoMode?: boolean; aiProvider?: string; integrations?: Record<string, boolean> }>();
  const store = getStore();
  Object.assign(store.settings, body);
  return c.json(store.settings);
});

app.post('/api/demo/reset', (c) => {
  resetStore();
  resetUnifyNotifications();
  return c.json({ message: 'Demo data reset' });
});

app.get('/api/demo/sample-datasets', (c) => {
  return c.json(
    loadDemoSources().map((s) => ({
      id: s.id,
      name: s.title,
      type: s.type,
      content: s.content
    }))
  );
});

export default app;
