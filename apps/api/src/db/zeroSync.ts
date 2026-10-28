import { and, eq } from 'drizzle-orm';
import { DEFAULT_WORKSPACE_ID } from './connection.js';
import { getDb, schema } from './client.js';
import type { CrmEntry, CrmSyncState } from '../store/memory.js';
import { buildZeroRecordPayload } from '../integrations/zero.js';
import type { ZeroSyncInput, ZeroSyncResult } from '../integrations/zero.js';

function toDate(value?: string) {
  return value ? new Date(value) : null;
}

function toSyncState(record: typeof schema.zeroSyncRecords.$inferSelect): CrmSyncState {
  return {
    status: record.status as CrmSyncState['status'],
    zeroId: record.zeroId ?? undefined,
    zeroUrl: record.zeroUrl ?? undefined,
    error: record.error ?? undefined,
    lastSyncedAt: record.lastSyncedAt?.toISOString()
  };
}

export async function getZeroSyncStatesForEntries(entries: CrmEntry[], workspaceId = DEFAULT_WORKSPACE_ID) {
  const db = await getDb();
  if (!db || entries.length === 0) return null;

  try {
    const rows = await db
      .select()
      .from(schema.zeroSyncRecords)
      .where(eq(schema.zeroSyncRecords.workspaceId, workspaceId));

    const states = new Map<string, CrmSyncState>();
    for (const row of rows) {
      states.set(`${row.entityType}:${row.entityId}`, toSyncState(row));
    }

    return entries.map((entry) => ({
      ...entry,
      zeroSync: states.get(`${entry.entityType}:${entry.entityId}`) ?? entry.zeroSync
    }));
  } catch (err) {
    console.warn('[zero/db] failed to load sync states:', err);
    return entries;
  }
}

export async function saveZeroSyncResult(input: ZeroSyncInput, result: ZeroSyncResult) {
  const db = await getDb();
  if (!db) return null;

  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const entityId = input.entityId ?? String(input.entity?.id ?? input.crmEntry?.entityId ?? input.crmEntry?.id ?? 'unknown');
  const payload = buildZeroRecordPayload({ ...input, workspaceId, entityId });
  const now = new Date();

  try {
    const rows = await db
      .insert(schema.zeroSyncRecords)
      .values({
        workspaceId,
        entityType: input.type,
        entityId,
        externalId: payload.externalId,
        status: result.status,
        zeroId: result.zeroId,
        zeroUrl: result.zeroUrl,
        error: result.error,
        lastPayload: payload as unknown as Record<string, unknown>,
        lastResponse: result as unknown as Record<string, unknown>,
        lastSyncedAt: toDate(result.lastSyncedAt),
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [
          schema.zeroSyncRecords.workspaceId,
          schema.zeroSyncRecords.entityType,
          schema.zeroSyncRecords.entityId
        ],
        set: {
          externalId: payload.externalId,
          status: result.status,
          zeroId: result.zeroId,
          zeroUrl: result.zeroUrl,
          error: result.error,
          lastPayload: payload as unknown as Record<string, unknown>,
          lastResponse: result as unknown as Record<string, unknown>,
          lastSyncedAt: toDate(result.lastSyncedAt),
          updatedAt: now
        }
      })
      .returning();

    return rows[0] ? toSyncState(rows[0]) : null;
  } catch (err) {
    console.warn('[zero/db] failed to persist sync result:', err);
    return null;
  }
}

export async function getZeroSyncState(workspaceId: string, entityType: string, entityId: string) {
  const db = await getDb();
  if (!db) return null;

  try {
    const rows = await db
      .select()
      .from(schema.zeroSyncRecords)
      .where(
        and(
          eq(schema.zeroSyncRecords.workspaceId, workspaceId),
          eq(schema.zeroSyncRecords.entityType, entityType),
          eq(schema.zeroSyncRecords.entityId, entityId)
        )
      )
      .limit(1);

    return rows[0] ? toSyncState(rows[0]) : null;
  } catch (err) {
    console.warn('[zero/db] failed to load sync state:', err);
    return null;
  }
}
