import { createPushNotifications } from '@beverly/tokens/push-notifications';
import { api } from './api';

export const customerPushNotifications = createPushNotifications('customer', {
    getConfig: () => api.get('/api/v1/customer/push/config'),
    save: (subscription) => {
        if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
            throw new Error('Push subscription is incomplete.');
        }
        return api.post('/api/v1/customer/push/subscription', {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        });
    },
    remove: (endpoint) => api.del(`/api/v1/customer/push/subscription?endpoint=${encodeURIComponent(endpoint)}`),
    test: () => api.post('/api/v1/customer/push/test', {}),
});
