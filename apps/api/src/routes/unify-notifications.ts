import { Hono } from 'hono';

import {

  getUnifyEvents,

  getUnifyNotificationsStatus,

  listAllSubscriptions,

  receiveWebhookNotification,

  sendTestNotification,

  subscribeToNotifications,

  unsubscribeFromNotifications,

  type SubscribeRequest,

  type TestNotificationRequest,

  type UnifyNotificationPayload

} from '../integrations/unify-notifications.js';



const unifyNotifications = new Hono();



function requireStringFields(body: Record<string, unknown>, fields: string[]): string | null {

  for (const field of fields) {

    const value = body[field];

    if (typeof value !== 'string' || !value.trim()) {

      return `${field} is required`;

    }

  }

  return null;

}



unifyNotifications.post('/subscribe', async (c) => {

  const body = await c.req.json<SubscribeRequest>();

  const error = requireStringFields(body as unknown as Record<string, unknown>, ['topic', 'subjectFilter', 'webhookUrl']);

  if (error) return c.json({ error }, 400);

  return c.json(subscribeToNotifications(body));

});



unifyNotifications.delete('/subscriptions/:id', async (c) => {

  const subscriptionId = c.req.param('id');

  if (!subscriptionId?.trim()) return c.json({ error: 'subscription id is required' }, 400);

  return c.json(await unsubscribeFromNotifications(subscriptionId));

});



unifyNotifications.post('/test', async (c) => {

  const body = await c.req.json<TestNotificationRequest>();

  const error = requireStringFields(body as unknown as Record<string, unknown>, ['event', 'conversationId', 'message']);

  if (error) return c.json({ error }, 400);

  return c.json(await sendTestNotification(body));

});



unifyNotifications.post('/webhook', async (c) => {

  const body = await c.req.json<UnifyNotificationPayload>();

  const error = requireStringFields(body as unknown as Record<string, unknown>, ['event', 'conversationId', 'message']);

  if (error) return c.json({ error }, 400);



  receiveWebhookNotification(

    {

      event: body.event,

      conversationId: body.conversationId,

      message: body.message,

      timestamp: body.timestamp ?? new Date().toISOString()

    },

    { source: 'simulated' }

  );



  return c.json({ received: true });

});



unifyNotifications.get('/events', (c) => c.json(getUnifyEvents()));

unifyNotifications.get('/subscriptions', async (c) => c.json(await listAllSubscriptions()));

unifyNotifications.get('/status', (c) => c.json(getUnifyNotificationsStatus()));



export default unifyNotifications;

