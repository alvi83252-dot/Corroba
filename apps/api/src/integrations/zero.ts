import { DEFAULT_WORKSPACE_ID } from '../db/connection.js';
import { getDb } from '../db/client.js';

export type ZeroSyncStatus = 'not_configured' | 'synced' | 'failed';

export interface ZeroSyncResult {
  synced: boolean;
  status: ZeroSyncStatus;
  zeroId?: string;
  zeroUrl?: string;
  error?: string;
  lastSyncedAt: string;
  mode: 'rest';
}

export interface ZeroSyncInput {
  type: string;
  workspaceId?: string;
  entityId?: string;
  title?: string;
  body?: string;
  entity?: Record<string, unknown>;
  crmEntry?: Record<string, unknown>;
  source?: Record<string, unknown>;
  signals?: Record<string, unknown>[];
}

export interface ZeroRecordPayload {
  externalId: string;
  type: string;
  title: string;
  body: string;
  source: {
    app: 'Corroba';
    workspaceId: string;
  };
  metadata: Record<string, unknown>;
}

const DEFAULT_WORKSPACE = DEFAULT_WORKSPACE_ID;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function summarizeErrorBody(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (/<!doctype html|<html/i.test(compact)) {
    const title = compact.match(/<title>(.*?)<\/title>/i)?.[1];
    return title ? `HTML response: ${title}` : 'HTML response instead of Zero API JSON';
  }
  return compact.slice(0, 300);
}

function buildExternalId(input: ZeroSyncInput) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE;
  const entityId =
    input.entityId ||
    getString(input.entity?.id) ||
    getString(input.crmEntry?.entityId) ||
    getString(input.crmEntry?.id) ||
    getString(input.source?.id, 'unknown');

  return `corroba:${workspaceId}:${input.type}:${entityId}`;
}

export function buildZeroRecordPayload(input: ZeroSyncInput): ZeroRecordPayload {
  const entity = input.entity ?? {};
  const crmEntry = input.crmEntry ?? {};
  const source = input.source ?? {};
  const workspaceId =
    input.workspaceId ||
    getString(entity.workspaceId) ||
    getString(source.workspaceId) ||
    DEFAULT_WORKSPACE;

  const quote = getString(entity.quote);
  const content = getString(entity.content) || getString(source.content);
  const title =
    input.title ||
    getString(crmEntry.title) ||
    getString(entity.title) ||
    getString(source.title) ||
    `${input.type.replace(/_/g, ' ')} from Corroba`;

  const proofScore = getNumber(entity.proofScore);
  const body = input.body ?? (quote || content.slice(0, 1200) || `${title} synced from Corroba.`);

  return {
    externalId: buildExternalId({ ...input, workspaceId }),
    type: input.type,
    title,
    body,
    source: {
      app: 'Corroba',
      workspaceId
    },
    metadata: {
      proofScore,
      category: entity.category,
      signalType: entity.signalType,
      recommendedUses: entity.recommendedUses,
      crmStatus: crmEntry.status,
      conversionOutcome: crmEntry.conversionOutcome,
      proofLoopEntity: entity,
      proofLoopCrmEntry: crmEntry,
      relatedSignals: input.signals
    }
  };
}

export function isZeroConfigured(): boolean {
  return Boolean(process.env.ZERO_API_KEY?.trim() && process.env.ZERO_API_URL?.trim());
}

export function getZeroRecordsUrl(): string {
  const baseUrl = trimTrailingSlash(process.env.ZERO_API_URL?.trim() || 'https://api.zero.inc');
  const endpoint = process.env.ZERO_API_RECORDS_PATH ?? '/proofloop/records';
  return `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

export async function isDatabaseConnected(): Promise<boolean> {
  const db = await getDb();
  return db !== null;
}

export async function getZeroStatus(dbConnected: boolean) {
  const configured = isZeroConfigured();
  return {
    service: 'zero' as const,
    mode: configured ? ('live' as const) : ('demo' as const),
    provider: 'Zero',
    configured,
    recordsUrl: getZeroRecordsUrl(),
    database: {
      configured: Boolean(process.env.DATABASE_URL || process.env.DB_URL),
      connected: dbConnected,
      url: process.env.DATABASE_URL ? '[DATABASE_URL set]' : process.env.DB_URL ? '[DB_URL set]' : undefined
    }
  };
}

export async function syncToZero(input: ZeroSyncInput): Promise<ZeroSyncResult> {
  const lastSyncedAt = new Date().toISOString();

  if (!process.env.ZERO_API_KEY || !process.env.ZERO_API_URL) {
    return {
      synced: false,
      status: 'not_configured',
      error: 'Add ZERO_API_KEY and ZERO_API_URL to enable Zero sync.',
      lastSyncedAt,
      mode: 'rest'
    };
  }

  const baseUrl = trimTrailingSlash(process.env.ZERO_API_URL);
  const endpoint = process.env.ZERO_API_RECORDS_PATH ?? '/proofloop/records';
  const payload = buildZeroRecordPayload(input);

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ZERO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => res.statusText);
      const summary = summarizeErrorBody(errorBody);
      return {
        synced: false,
        status: 'failed',
        error: `Zero sync failed with ${res.status}${summary ? `: ${summary}` : `: ${res.statusText}`}`,
        lastSyncedAt,
        mode: 'rest'
      };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string; url?: string };
    return {
      synced: true,
      status: 'synced',
      zeroId: data.id,
      zeroUrl: data.url,
      lastSyncedAt,
      mode: 'rest'
    };
  } catch (error) {
    return {
      synced: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown Zero sync error',
      lastSyncedAt,
      mode: 'rest'
    };
  }
}
