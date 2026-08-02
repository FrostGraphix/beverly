import { createPushNotifications } from '@beverly/tokens/push-notifications';
import { deleteApi, getApi, postApi } from './api.js';

const portal = 'crm';
const unwrap = (response) => response?.data ?? response?.result ?? response;

export const crmPushNotifications = createPushNotifications(portal, {
  async getConfig() {
    return unwrap(await getApi('/api/v1/admin/push/config'));
  },
  async save(subscription) {
    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      throw new Error('Push subscription is incomplete.');
    }
    await postApi('/api/v1/admin/push/subscription', {
      portal,
      endpoint: subscription.endpoint,
      keys: subscription.keys
    });
  },
  async remove(endpoint) {
    await deleteApi(`/api/v1/admin/push/subscription?endpoint=${encodeURIComponent(endpoint)}`);
  },
  async test() {
    await postApi('/api/v1/admin/push/test', { portal });
  }
});
