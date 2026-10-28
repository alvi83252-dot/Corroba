import { fetchUnifyConversations, getUnifyBaseUrl } from '../integrations/unify.js';
import { isUnifyGtmConfigured } from '../integrations/unifygtm.js';
import { chunkConversation, chunkText } from './chunker.js';
import {
  clearStore,
  getAllChunks,
  getChunkCount,
  getDocumentCount,
  hybridSearch,
  upsertDocument,
  type RagDocument
} from './vector-store.js';
import type { AudienceMatch } from '../data/demo.js';
import { DEMO_AUDIENCES } from '../data/demo.js';
import type { ExtractedSignal } from '../data/demo.js';
import { runProofDiscoveryPipeline } from '../ai/pipeline.js';
import {
  applyDemoGuidance,
  findMatchingGuidance,
  indexDemoGuidance,
  indexDemoSources,
  loadDemoGuidance,
  loadDemoSources,
  getDemoDataSummary
} from './demo-data-loader.js';

export interface RagIngestResult {
  documentsIngested: number;
  chunksIndexed: number;
  source: 'unify' | 'demo' | 'upload' | 'demo-data' | 'mixed';
}

export interface RagQueryResult {
  query: string;
  answer: string;
  chunks: Array<{ id: string; title: string; text: string; score: number; source: string }>;
  source: 'unify' | 'demo' | 'local' | 'mixed';
}

export interface RagStatus {
  documents: number;
  chunks: number;
  unifyConfigured: boolean;
  unifyBaseUrl: string;
  embeddingProvider: 'voyage' | 'hash';
  sources: Record<string, number>;
  demoDataSources: number;
  demoGuidanceExamples: number;
}

export interface DiscoveryRagResult {
  signals: ExtractedSignal[];
  ragUsed: boolean;
  chunksRetrieved: number;
  demoDataMatched: boolean;
  indexedChunks: number;
  chunks: Array<{ id: string; title: string; text: string; score: number; source: string }>;
  mode?: 'paste' | 'upload' | 'demo';
}

let lastIngestSource: RagIngestResult['source'] = 'demo';

export function getRagStatus(): RagStatus {
  const chunks = getAllChunks();
  const sources: Record<string, number> = {};
  for (const c of chunks) {
    sources[c.source] = (sources[c.source] ?? 0) + 1;
  }

  return {
    documents: getDocumentCount(),
    chunks: getChunkCount(),
    unifyConfigured: isUnifyGtmConfigured(),
    unifyBaseUrl: getUnifyBaseUrl(),
    embeddingProvider: process.env.VOYAGE_API_KEY ? 'voyage' : 'hash',
    sources,
    demoDataSources: loadDemoSources().length,
    demoGuidanceExamples: loadDemoGuidance().length
  };
}

/** Index an uploaded/pasted document into RAG (additive — does not wipe Unify data) */
export async function ingestUploadedDocument(doc: {
  id: string;
  title: string;
  text: string;
  type?: string;
}): Promise<number> {
  if (!doc.text.trim()) return 0;

  const ragDoc: RagDocument = {
    id: doc.id,
    source: `upload-${doc.type ?? 'document'}`,
    title: doc.title,
    text: doc.text,
    metadata: { type: doc.type ?? 'document', uploadedAt: new Date().toISOString() }
  };

  const chunks = chunkText(`[${doc.title}]\n${doc.text}`);
  return upsertDocument(ragDoc, chunks);
}

/** Fetch Unify conversations and index (optionally wipe index first) */
export async function ingestUnifyConversations(force = false): Promise<RagIngestResult> {
  if (force) clearStore();

  const { conversations, source } = await fetchUnifyConversations();
  lastIngestSource = source === 'unifygtm' ? 'unify' : source;

  let totalChunks = 0;
  for (const conv of conversations) {
    const doc: RagDocument = {
      id: conv.id,
      source: 'unify-conversations',
      title: conv.title,
      text: conv.text,
      metadata: conv.metadata
    };
    totalChunks += await upsertDocument(doc, chunkConversation(conv.title, conv.text));
  }

  const demoChunks = await indexAllDemoData();

  return {
    documentsIngested: conversations.length + loadDemoSources().length,
    chunksIndexed: totalChunks + demoChunks,
    source: force ? (source === 'unifygtm' ? 'unify' : source) : 'mixed'
  };
}

async function indexAllDemoData(): Promise<number> {
  const sourceChunks = await indexDemoSources();
  const guidanceChunks = await indexDemoGuidance();
  return sourceChunks + guidanceChunks;
}

/** Bootstrap index on startup if empty */
export async function bootstrapRagIndex(): Promise<RagIngestResult> {
  if (getChunkCount() > 0) {
    return {
      documentsIngested: getDocumentCount(),
      chunksIndexed: getChunkCount(),
      source: 'mixed'
    };
  }
  return ingestUnifyConversations(false);
}

export async function ragQuery(query: string, topK = 5): Promise<RagQueryResult> {
  if (getChunkCount() === 0) {
    await bootstrapRagIndex();
  }

  const results = await hybridSearch(query, topK);
  const answer = await synthesizeAnswer(query, results.map((r) => r.text));

  const sources = new Set(results.map((r) => r.source));
  const sourceLabel = sources.size > 1 ? 'mixed' : sources.has('unify-conversations') ? lastIngestSource : 'local';

  return {
    query,
    answer,
    chunks: results.map((r) => ({
      id: r.id,
      title: r.title,
      text: r.text,
      score: Math.round(r.score * 1000) / 1000,
      source: r.source
    })),
    source: sourceLabel as RagQueryResult['source']
  };
}

/**
 * RAG-augmented proof discovery:
 * 1. Index uploaded content into RAG
 * 2. Retrieve similar demo-data sources + guidance examples
 * 3. Extract trust signals (rule-based or OpenAI)
 * 4. Refine outputs using demo-data guidance
 */
export async function discoverProofWithRag(
  content: string,
  meta?: { sourceId?: string; title?: string; type?: string }
): Promise<DiscoveryRagResult> {
  if (getChunkCount() === 0) {
    await bootstrapRagIndex();
  }

  let indexedChunks = 0;
  if (meta?.sourceId && content.trim()) {
    indexedChunks = await ingestUploadedDocument({
      id: meta.sourceId,
      title: meta.title ?? 'Uploaded Document',
      text: content,
      type: meta.type
    });
  }

  const retrieved = await hybridSearch(content.slice(0, 1500), 6);
  const ragContextText = retrieved.map((r) => r.text).join('\n\n');

  let signals = await runProofDiscoveryPipeline(content, ragContextText);
  const beforeGuidance = signals.length;
  signals = applyDemoGuidance(signals, content);

  const demoDataMatched =
    beforeGuidance !== signals.length ||
    retrieved.some((r) => r.source === 'demo-guidance' || r.source === 'demo-data') ||
    findMatchingGuidance(content) !== null;

  return {
    signals,
    ragUsed: retrieved.length > 0,
    chunksRetrieved: retrieved.length,
    demoDataMatched,
    indexedChunks,
    chunks: retrieved.map((r) => ({
      id: r.id,
      title: r.title,
      text: r.text,
      score: Math.round(r.score * 1000) / 1000,
      source: r.source
    })),
    mode: content.trim() ? (meta?.type === 'demo' ? 'demo' : 'paste') : 'demo'
  };
}

/** Scan pre-loaded demo-data folder — no upload or paste required */
export async function discoverFromDemoData(): Promise<DiscoveryRagResult> {
  if (getChunkCount() === 0) {
    await bootstrapRagIndex();
  }

  const sources = loadDemoSources();
  const combinedContent = sources.map((s) => `[${s.title}]\n${s.content}`).join('\n\n');
  const query = 'customer proof ROI savings time efficiency growth testimonials conversion NPS';
  const retrieved = await hybridSearch(query, 8);
  const ragContextText = retrieved.map((r) => r.text).join('\n\n');

  let signals = await runProofDiscoveryPipeline(combinedContent, ragContextText);
  signals = applyDemoGuidance(signals, combinedContent);

  const seen = new Set<string>();
  signals = signals.filter((s) => {
    if (seen.has(s.quote)) return false;
    seen.add(s.quote);
    return true;
  });

  return {
    signals,
    ragUsed: true,
    chunksRetrieved: retrieved.length,
    demoDataMatched: true,
    indexedChunks: 0,
    chunks: retrieved.map((r) => ({
      id: r.id,
      title: r.title,
      text: r.text,
      score: Math.round(r.score * 1000) / 1000,
      source: r.source
    })),
    mode: 'demo'
  };
}

export { getAllChunks, getDemoDataSummary };

async function synthesizeAnswer(query: string, contexts: string[]): Promise<string> {
  if (contexts.length === 0) {
    return 'No relevant data found. Upload documents, use demo-data samples, or ingest Unify conversations.';
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateWithOpenAI(query, contexts);
    } catch {
      return templateAnswer(query, contexts);
    }
  }

  return templateAnswer(query, contexts);
}

async function generateWithOpenAI(query: string, contexts: string[]): Promise<string> {
  const contextBlock = contexts.map((c, i) => `[${i + 1}] ${c}`).join('\n\n');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are Corroba RAG. Answer using ONLY the provided context from uploaded documents, demo-data guidance, and customer conversations. Focus on customer proof, ROI, trust signals, and ICP insights.'
        },
        {
          role: 'user',
          content: `Query: ${query}\n\nContext:\n${contextBlock}\n\nProvide a concise, evidence-based answer.`
        }
      ],
      temperature: 0.3,
      max_tokens: 400
    })
  });

  if (!res.ok) throw new Error('OpenAI generation failed');
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? templateAnswer(query, contexts);
}

function templateAnswer(query: string, contexts: string[]): string {
  const snippet = contexts[0]?.slice(0, 280) ?? '';
  const proofMatches =
    contexts.join(' ').match(/(?:saved?|reduce[ds]?|increased?|[\£$€][\d,]+|\d+%|\d+\s*hours?)[^.!?]*/gi) ?? [];
  const proofLine = proofMatches[0] ? ` Key proof found: "${proofMatches[0].trim()}".` : '';

  return `Based on ${contexts.length} relevant source(s) for "${query}": ${snippet}...${proofLine}`;
}

export async function expandAudienceWithRag(proofQuote: string): Promise<{
  audiences: AudienceMatch[];
  ragContext: RagQueryResult;
}> {
  const ragContext = await ragQuery(proofQuote, 5);
  const combinedText = [proofQuote, ...ragContext.chunks.map((c) => c.text)].join('\n');

  const industryRules: Array<{ pattern: RegExp; audience: AudienceMatch }> = [
    {
      pattern: /recruit|staffing|screening|cv|talent platform|hiring/i,
      audience: { ...DEMO_AUDIENCES[0], description: 'RAG-matched: recruitment agencies discussing time savings and screening automation', resonanceScore: 94 }
    },
    {
      pattern: /staffing|enterprise staffing|high-volume hiring|sdr/i,
      audience: { ...DEMO_AUDIENCES[1], description: 'RAG-matched: enterprise staffing firms seeking shorter sales cycles', resonanceScore: 91 }
    },
    {
      pattern: /talent platform|hr tech|burnout|champion/i,
      audience: { ...DEMO_AUDIENCES[2], description: 'RAG-matched: talent platforms responding to emotional proof signals', resonanceScore: 88 }
    },
    {
      pattern: /saas|startup|marketing team|support ticket|landing page/i,
      audience: { ...DEMO_AUDIENCES[3], description: 'RAG-matched: B2B SaaS teams amplifying buried customer proof', resonanceScore: 85 }
    },
    {
      pattern: /customer success|nps|survey|cs team|renewal/i,
      audience: { ...DEMO_AUDIENCES[4], description: 'RAG-matched: CS teams surfacing proof from conversations and surveys', resonanceScore: 82 }
    }
  ];

  const matched: AudienceMatch[] = [];
  for (const rule of industryRules) {
    if (rule.pattern.test(combinedText)) {
      const scoreBoost = ragContext.chunks.length > 0 ? Math.min(ragContext.chunks[0].score * 10, 8) : 0;
      matched.push({
        ...rule.audience,
        icpMatch: Math.min(99, rule.audience.icpMatch + Math.round(scoreBoost)),
        resonanceScore: Math.min(99, rule.audience.resonanceScore + Math.round(scoreBoost / 2))
      });
    }
  }

  return { audiences: matched.length > 0 ? matched.slice(0, 5) : DEMO_AUDIENCES, ragContext };
}
