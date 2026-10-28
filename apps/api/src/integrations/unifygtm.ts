/**
 * UnifyGTM — Outbound infrastructure / Data API
 * https://api.unifygtm.com/data/v1
 * Auth: X-Api-Key header
 */

export interface UnifyGtmRecord {
  id?: string;
  attributes?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface UnifyGtmUpsertResult {
  synced: boolean;
  mode: 'live' | 'demo';
  recordId?: string;
  objectName: string;
  record?: UnifyGtmRecord;
  error?: string;
}

export interface UnifyGtmStatus {
  service: 'unifygtm';
  mode: 'live' | 'demo';
  provider: 'UnifyGTM';
  configured: boolean;
  dataApiUrl: string;
  proofObject: string;
  companyDomain: string;
  companyName: string;
}

const DEFAULT_DATA_API = 'https://api.unifygtm.com/data/v1';
const DEFAULT_PROOF_OBJECT = 'company';
const DEFAULT_COMPANY_DOMAIN = 'btm.com';
const DEFAULT_COMPANY_NAME = 'BTM.com';

export function normalizeCompanyDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

export function getUnifyGtmCompanyDomain(): string {
  const raw = process.env.UNIFYGTM_COMPANY_DOMAIN?.trim() || DEFAULT_COMPANY_DOMAIN;
  return normalizeCompanyDomain(raw);
}

export function getUnifyGtmCompanyName(): string {
  return process.env.UNIFYGTM_COMPANY_NAME?.trim() || DEFAULT_COMPANY_NAME;
}

export function getUnifyGtmApiKey(): string | null {
  return (
    process.env.UNIFYGTM_API_KEY?.trim() ||
    process.env.UNIFY_API_KEY?.trim() ||
    null
  );
}

export function getUnifyGtmDataApiUrl(): string {
  const url = process.env.UNIFYGTM_API_URL?.trim() || process.env.UNIFY_API_URL?.trim();
  return (url || DEFAULT_DATA_API).replace(/\/$/, '');
}

export function getUnifyGtmProofObject(): string {
  return process.env.UNIFYGTM_PROOF_OBJECT?.trim() || DEFAULT_PROOF_OBJECT;
}

export function isUnifyGtmConfigured(): boolean {
  return Boolean(getUnifyGtmApiKey());
}

function unifyGtmHeaders(): Record<string, string> {
  return {
    'X-Api-Key': getUnifyGtmApiKey()!,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
}

async function unifyGtmFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getUnifyGtmDataApiUrl();
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...unifyGtmHeaders(),
      ...(init.headers as Record<string, string> | undefined)
    }
  });
}

/** List objects available in the UnifyGTM workspace */
export async function listUnifyGtmObjects(): Promise<{ objects: unknown[]; mode: 'live' | 'demo'; error?: string }> {
  if (!isUnifyGtmConfigured()) {
    return { objects: [], mode: 'demo' };
  }

  try {
    const res = await unifyGtmFetch('/objects');
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { objects: [], mode: 'live', error: `UnifyGTM objects error (${res.status}): ${errText}` };
    }
    const data = await res.json();
    const objects = Array.isArray(data)
      ? data
      : Array.isArray((data as { data?: unknown[] }).data)
        ? (data as { data: unknown[] }).data
        : [];
    return { objects, mode: 'live' };
  } catch (err) {
    return {
      objects: [],
      mode: 'live',
      error: err instanceof Error ? err.message : 'Failed to list UnifyGTM objects'
    };
  }
}

/** Build upsert payload from a ProofLoop trust signal — matched to your UnifyGTM company (BTM.com) */
export function buildProofUpsertPayload(input: {
  id?: string;
  quote: string;
  signalType?: string;
  proofScore?: number;
  category?: string;
  companyDomain?: string;
  companyName?: string;
  allQuotes?: string[];
}): {
  match: Record<string, string>;
  create_or_update: Record<string, unknown>;
} {
  const domain = normalizeCompanyDomain(input.companyDomain ?? getUnifyGtmCompanyDomain());
  const name = input.companyName ?? getUnifyGtmCompanyName();
  const slug = input.id ?? input.quote.slice(0, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const summary =
    input.allQuotes && input.allQuotes.length > 1
      ? input.allQuotes.map((q, i) => `${i + 1}. ${q}`).join('\n\n')
      : input.quote;

  return {
    match: { domain },
    create_or_update: {
      domain,
      name,
      description: summary,
      proofloop_latest_quote: input.quote,
      proofloop_signal_id: input.id ?? slug,
      proofloop_signal_type: input.signalType ?? 'trust_signal',
      proofloop_proof_score: input.proofScore ?? 0,
      proofloop_category: input.category ?? 'general',
      proofloop_signal_count: input.allQuotes?.length ?? 1,
      proofloop_source: 'proofloop'
    }
  };
}

/** Upsert a proof signal record into UnifyGTM (default object: company) */
export async function upsertProofToUnifyGtm(input: {
  id?: string;
  quote: string;
  signalType?: string;
  proofScore?: number;
  category?: string;
  companyDomain?: string;
  companyName?: string;
  objectName?: string;
  allQuotes?: string[];
}): Promise<UnifyGtmUpsertResult> {
  const objectName = input.objectName ?? getUnifyGtmProofObject();

  if (!isUnifyGtmConfigured()) {
    return { synced: false, mode: 'demo', objectName };
  }

  const body = buildProofUpsertPayload(input);

  try {
    const res = await unifyGtmFetch(`/objects/${encodeURIComponent(objectName)}/records/upsert`, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const responseText = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
    } catch {
      data = { raw: responseText };
    }

    if (!res.ok) {
      return {
        synced: false,
        mode: 'live',
        objectName,
        error: `UnifyGTM upsert error (${res.status}): ${responseText || res.statusText}`
      };
    }

    const record = (data.data ?? data) as UnifyGtmRecord;
    const recordId = String(record.id ?? (data as { id?: string }).id ?? '');

    return {
      synced: true,
      mode: 'live',
      objectName,
      recordId: recordId || undefined,
      record
    };
  } catch (err) {
    return {
      synced: false,
      mode: 'live',
      objectName,
      error: err instanceof Error ? err.message : 'UnifyGTM upsert failed'
    };
  }
}

export async function syncTrustSignalsToUnifyGtm(
  signals: Array<{
    id: string;
    quote: string;
    signalType: string;
    proofScore: number;
    category: string;
  }>
): Promise<{ synced: number; total: number; results: UnifyGtmUpsertResult[] }> {
  if (signals.length === 0) {
    return { synced: 0, total: 0, results: [] };
  }

  const sorted = [...signals].sort((a, b) => b.proofScore - a.proofScore);
  const top = sorted[0];

  // One company record for BTM.com — aggregate all proof quotes on the org
  const result = await upsertProofToUnifyGtm({
    id: top.id,
    quote: top.quote,
    signalType: top.signalType,
    proofScore: top.proofScore,
    category: top.category,
    companyDomain: getUnifyGtmCompanyDomain(),
    companyName: getUnifyGtmCompanyName(),
    allQuotes: sorted.map((s) => s.quote)
  });

  return {
    synced: result.synced ? 1 : 0,
    total: 1,
    results: [result]
  };
}

export function getUnifyGtmStatus(): UnifyGtmStatus {
  return {
    service: 'unifygtm',
    mode: isUnifyGtmConfigured() ? 'live' : 'demo',
    provider: 'UnifyGTM',
    configured: isUnifyGtmConfigured(),
    dataApiUrl: getUnifyGtmDataApiUrl(),
    proofObject: getUnifyGtmProofObject(),
    companyDomain: getUnifyGtmCompanyDomain(),
    companyName: getUnifyGtmCompanyName()
  };
}
