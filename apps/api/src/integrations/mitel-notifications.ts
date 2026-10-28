import { createHmac, timingSafeEqual } from 'crypto';
import { getMitelAccessToken } from './mitel-auth.js';

const DEFAULT_NOTIFICATIONS_BASE = 'https://notifications.eu.api.mitel.io/2017-09-01';

const TOPIC_ALIASES: Record<string, string> = {
  conversations: 'platform-api-conversations',
  chat: 'platform-api-conversations',
  media: 'platform-api-media',
  presence: 'platform-api-presence',
  admin: 'platform-api-admin'
};

const DEFAULT_CONVERSATION_SUBJECT = '^/conversations/[^/]+/messages/[^/]+$';

export interface MitelSubscriptionRequest {
  applicationId: string;
  deviceId: string;
  transport: 'webhook';
  topic: string;
  subjectFilter: string;
  publicationFilter?: string;
}

export interface MitelSubscriptionRecord {
  subscriptionId: string;
  topic: string;
  subjectFilter: string;
  deviceId: string;
  applicationId: string;
  transport: string;
  createdAt?: string;
}

export function getMitelNotificationsBaseUrl(): string {
  return (process.env.MITEL_NOTIFICATIONS_URL ?? DEFAULT_NOTIFICATIONS_BASE).replace(/\/$/, '');
}

export function getMitelApplicationId(): string {
  return (
    process.env.MITEL_APPLICATION_ID?.trim() ||
    process.env.MITEL_CLIENT_ID?.trim() ||
    'proofloop-notifications-app'
  );
}

export function isMitelNotificationsLive(): boolean {
  const hasAuth =
    Boolean(process.env.MITEL_CLIENT_ID?.trim() && process.env.MITEL_CLIENT_SECRET?.trim()) ||
    Boolean(process.env.UNIFY_API_KEY?.trim() || process.env.MITEL_API_KEY?.trim());

  return hasAuth && Boolean(getMitelApplicationId());
}

export function normalizeMitelTopic(topic: string): string {
  const trimmed = topic.trim();
  return TOPIC_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function normalizeMitelSubjectFilter(topic: string, subjectFilter: string): string {
  const trimmed = subjectFilter.trim();
  if (!trimmed) return DEFAULT_CONVERSATION_SUBJECT;
  if (trimmed.startsWith('^') || trimmed.includes('/conversations') || trimmed.includes('/endpoints')) {
    return trimmed;
  }

  const mitelTopic = normalizeMitelTopic(topic);
  if (mitelTopic === 'platform-api-conversations') {
    return DEFAULT_CONVERSATION_SUBJECT;
  }

  return trimmed;
}

export function buildPublicationFilter(keyword: string): string | undefined {
  const kw = keyword.trim();
  if (!kw || kw.startsWith('^') || kw.includes('/')) return undefined;
  return `$.publications[?(@.content.body && @.content.body.indexOf('${kw.replace(/'/g, "\\'")}') >= 0)]`;
}

export function resolvePublicWebhookUrl(webhookUrl: string): string {
  const trimmed = webhookUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const base = (
    process.env.MITEL_WEBHOOK_BASE_URL ??
    process.env.API_BASE_URL ??
    `http://localhost:${process.env.PORT ?? 3001}`
  ).replace(/\/$/, '');

  return `${base}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

export function verifyMitelWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  applicationId: string
): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', applicationId).update(rawBody).digest('hex');
  const received = signatureHeader.trim().toLowerCase();

  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(received, 'hex');
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return expected === received;
  }
}

async function mitelFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getMitelAccessToken();
  const base = getMitelNotificationsBaseUrl();

  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  });
}

export async function createMitelSubscription(input: {
  topic: string;
  subjectFilter: string;
  webhookUrl: string;
  publicationFilter?: string;
}): Promise<MitelSubscriptionRecord> {
  const mitelTopic = normalizeMitelTopic(input.topic);
  const subjectFilter = normalizeMitelSubjectFilter(input.topic, input.subjectFilter);
  const applicationId = getMitelApplicationId();
  const deviceId = resolvePublicWebhookUrl(input.webhookUrl);

  const body: MitelSubscriptionRequest = {
    applicationId,
    deviceId,
    transport: 'webhook',
    topic: mitelTopic,
    subjectFilter
  };

  const publicationFilter =
    input.publicationFilter ?? buildPublicationFilter(input.subjectFilter);
  if (publicationFilter) body.publicationFilter = publicationFilter;

  const res = await mitelFetch('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Mitel notifications subscribe error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const subscriptionId = String(data.subscriptionId ?? data.id ?? '');

  if (!subscriptionId) {
    throw new Error('Mitel notifications API did not return a subscriptionId');
  }

  return {
    subscriptionId,
    topic: mitelTopic,
    subjectFilter,
    deviceId,
    applicationId,
    transport: 'webhook',
    createdAt: typeof data.createdOn === 'string' ? data.createdOn : new Date().toISOString()
  };
}

export async function listMitelSubscriptions(): Promise<MitelSubscriptionRecord[]> {
  const res = await mitelFetch('/subscriptions', { method: 'GET' });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Mitel notifications list error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const items = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown[] }).items) ? (data as { items: unknown[] }).items : [];

  return items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      subscriptionId: String(row.subscriptionId ?? row.id ?? ''),
      topic: String(row.topic ?? ''),
      subjectFilter: String(row.subjectFilter ?? ''),
      deviceId: String(row.deviceId ?? ''),
      applicationId: String(row.applicationId ?? getMitelApplicationId()),
      transport: String(row.transport ?? 'webhook'),
      createdAt: typeof row.createdOn === 'string' ? row.createdOn : undefined
    };
  });
}

export async function deleteMitelSubscription(subscriptionId: string): Promise<void> {
  const res = await mitelFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE'
  });

  if (!res.ok && res.status !== 404) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Mitel notifications unsubscribe error (${res.status}): ${errText}`);
  }
}

export function parseMitelWebhookPayload(raw: unknown): {
  event: string;
  conversationId: string;
  message: string;
  timestamp: string;
  raw: unknown;
} {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const publication =
    obj.publication && typeof obj.publication === 'object'
      ? (obj.publication as Record<string, unknown>)
      : obj;

  const content =
    publication.content && typeof publication.content === 'object'
      ? (publication.content as Record<string, unknown>)
      : {};

  const subject = String(publication.subject ?? obj.subject ?? '');
  const conversationMatch = subject.match(/\/conversations\/([^/]+)/i);
  const conversationId = conversationMatch?.[1] ?? String(content.conversationId ?? obj.conversationId ?? 'unknown');

  const message = String(
    content.body ??
      content.text ??
      content.message ??
      publication.summary ??
      obj.message ??
      JSON.stringify(content).slice(0, 500)
  );

  const event = String(
    publication.method ?? publication.eventType ?? obj.event ?? obj.method ?? 'notification.received'
  );

  const timestamp = String(
    publication.createdOn ??
      publication.timestamp ??
      obj.timestamp ??
      new Date().toISOString()
  );

  return { event, conversationId, message, timestamp, raw };
}

export function getMitelNotificationsStatus() {
  return {
    live: isMitelNotificationsLive(),
    notificationsUrl: getMitelNotificationsBaseUrl(),
    applicationId: getMitelApplicationId(),
    webhookBaseUrl: process.env.MITEL_WEBHOOK_BASE_URL ?? process.env.API_BASE_URL ?? null
  };
}
