import { createPushNotifications, type DeviceNotificationState } from '@beverly/tokens/push-notifications';
import { api } from './api';

export type { DeviceNotificationState };

const vendorPush = createPushNotifications('vendor', {
    getConfig: () => api.get('/api/v1/vendor/push/config'),
    save(subscription) {
        if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
            throw new Error('Push subscription is incomplete.');
        }
        return api.post('/api/v1/vendor/push/subscription', {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        });
    },
    remove: (endpoint) => api.del(`/api/v1/vendor/push/subscription?endpoint=${encodeURIComponent(endpoint)}`),
    test: () => api.post('/api/v1/vendor/push/test', {}),
});

export const deviceNotificationState = vendorPush.state;
export const enableDeviceNotifications = vendorPush.enable;
export const disableDeviceNotifications = vendorPush.disable;
export const syncDeviceNotifications = vendorPush.sync;
export const testDeviceNotifications = vendorPush.test;
