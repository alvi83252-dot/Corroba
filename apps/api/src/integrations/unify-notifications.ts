import { v4 as uuidv4 } from 'uuid';
import { getUnifyGtmStatus, isUnifyGtmConfigured } from './unifygtm.js';

/** UnifyGTM outbound notifications — simulated locally; live sync via Data API */

export interface UnifySubscription {
  subscriptionId: string;
  topic: string;
  subjectFilter: string;
  webhookUrl: string;
  createdAt: string;
  source: 'unifygtm' | 'simulated';
}

export interface UnifyNotificationPayload {
  event: string;
  conversationId: string;
  message: string;
  timestamp: string;
}

export interface UnifyEvent extends UnifyNotificationPayload {
  id: string;
  receivedAt: string;
  source: 'unifygtm' | 'simulated';
}

export interface SubscribeRequest {
  topic: string;
  subjectFilter: string;
  webhookUrl: string;
}

export interface SubscribeResponse {
  status: 'subscribed';
  subscriptionId: string;
  topic: string;
  subjectFilter: string;
  webhookUrl: string;
  mode: 'live' | 'simulated';
}

export interface TestNotificationRequest {
  event: string;
  conversationId: string;
  message: string;
}

export interface TestNotificationResponse {
  status: 'sent';
  subscriptionsNotified: number;
  mode: 'live' | 'simulated';
  note?: string;
  deliveryResults?: Array<{ subscriptionId: string; webhookUrl: string; ok: boolean; status?: number }>;
}

const subscriptions: UnifySubscription[] = [];
export const unifyEvents: UnifyEvent[] = [];

export function isNotificationsLiveMode(): boolean {
  return isUnifyGtmConfigured();
}

export function getUnifySubscriptions(): UnifySubscription[] {
  return [...subscriptions];
}

export function getUnifyEvents(): UnifyEvent[] {
  return [...unifyEvents];
}

export function resetUnifyNotifications(): void {
  subscriptions.length = 0;
  unifyEvents.length = 0;
}

export function resolveWebhookUrl(webhookUrl: string): string {
  const trimmed = webhookUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const base = (process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`).replace(/\/$/, '');
  return `${base}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

export function subscribeToNotifications(body: SubscribeRequest): SubscribeResponse {
  const subscription: UnifySubscription = {
    subscriptionId: uuidv4(),
    topic: body.topic,
    subjectFilter: body.subjectFilter,
    webhookUrl: body.webhookUrl,
    createdAt: new Date().toISOString(),
    source: isUnifyGtmConfigured() ? 'unifygtm' : 'simulated'
  };

  subscriptions.push(subscription);

  return {
    status: 'subscribed',
    subscriptionId: subscription.subscriptionId,
    topic: subscription.topic,
    subjectFilter: subscription.subjectFilter,
    webhookUrl: subscription.webhookUrl,
    mode: isUnifyGtmConfigured() ? 'live' : 'simulated'
  };
}

export async function listAllSubscriptions(): Promise<UnifySubscription[]> {
  return getUnifySubscriptions();
}

export async function unsubscribeFromNotifications(subscriptionId: string): Promise<{ removed: boolean; mode: 'live' | 'simulated' }> {
  const index = subscriptions.findIndex((s) => s.subscriptionId === subscriptionId);
  if (index >= 0) subscriptions.splice(index, 1);
  return { removed: index >= 0, mode: isUnifyGtmConfigured() ? 'live' : 'simulated' };
}

export function receiveWebhookNotification(
  payload: UnifyNotificationPayload,
  meta: { source?: 'unifygtm' | 'simulated' } = {}
): UnifyEvent {
  const event: UnifyEvent = {
    id: uuidv4(),
    ...payload,
    receivedAt: new Date().toISOString(),
    source: meta.source ?? (isUnifyGtmConfigured() ? 'unifygtm' : 'simulated')
  };

  unifyEvents.unshift(event);
  console.log('[unify/notifications/webhook] received:', JSON.stringify(event, null, 2));

  return event;
}

export async function sendTestNotification(body: TestNotificationRequest): Promise<TestNotificationResponse> {
  const payload: UnifyNotificationPayload = {
    event: body.event,
    conversationId: body.conversationId,
    message: body.message,
    timestamp: new Date().toISOString()
  };

  if (isUnifyGtmConfigured()) {
    return {
      status: 'sent',
      subscriptionsNotified: subscriptions.length,
      mode: 'live',
      note:
        'UnifyGTM live mode: proof records sync via Data API upsert. Use Sync to UnifyGTM on the Unify page or POST /api/unify/sync-signals.'
    };
  }

  if (subscriptions.length === 0) {
    return { status: 'sent', subscriptionsNotified: 0, mode: 'simulated', deliveryResults: [] };
  }

  const deliveryResults: TestNotificationResponse['deliveryResults'] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      const targetUrl = resolveWebhookUrl(sub.webhookUrl);
      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-UnifyGTM-Simulation': 'true' },
          body: JSON.stringify(payload)
        });
        deliveryResults!.push({
          subscriptionId: sub.subscriptionId,
          webhookUrl: sub.webhookUrl,
          ok: res.ok,
          status: res.status
        });
      } catch (err) {
        console.warn(`[unify/notifications/test] webhook delivery failed for ${sub.webhookUrl}:`, err);
        deliveryResults!.push({
          subscriptionId: sub.subscriptionId,
          webhookUrl: sub.webhookUrl,
          ok: false
        });
      }
    })
  );

  return {
    status: 'sent',
    subscriptionsNotified: deliveryResults!.filter((r) => r.ok).length,
    mode: 'simulated',
    deliveryResults
  };
}

export function getUnifyNotificationsStatus() {
  const gtm = getUnifyGtmStatus();
  const live = isUnifyGtmConfigured();

  return {
    service: 'unifygtm-notifications',
    mode: live ? 'live' : 'simulated',
    provider: 'UnifyGTM',
    unifygtm: {
      configured: gtm.configured,
      dataApiUrl: gtm.dataApiUrl,
      proofObject: gtm.proofObject
    },
    subscriptions: subscriptions.length,
    eventsReceived: unifyEvents.length,
    endpoints: {
      subscribe: 'POST /api/unify/notifications/subscribe',
      test: 'POST /api/unify/notifications/test',
      webhook: 'POST /api/unify/notifications/webhook',
      events: 'GET /api/unify/notifications/events',
      syncSignals: 'POST /api/unify/sync-signals',
      status: 'GET /api/unify/status'
    }
  };
}
