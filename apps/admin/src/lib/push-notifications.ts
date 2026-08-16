import { createPushNotifications } from '@beverly/tokens/push-notifications';
import { api } from './api';

const portal = 'admin';

export const adminPushNotifications = createPushNotifications(portal, {
    getConfig: () => api.get('/api/v1/admin/push/config'),
    save(subscription) {
        if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
            throw new Error('Push subscription is incomplete.');
        }
        return api.post('/api/v1/admin/push/subscription', {
            portal,
            endpoint: subscription.endpoint,
            keys: subscription.keys,
        });
    },
    remove: (endpoint) => api.del(`/api/v1/admin/push/subscription?endpoint=${encodeURIComponent(endpoint)}`),
    test: () => api.post('/api/v1/admin/push/test', { portal }),
});
