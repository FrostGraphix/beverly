import { api } from './api';

export type DeviceNotificationState = 'unsupported' | 'default' | 'enabled' | 'blocked' | 'unavailable';

type PushConfig = { available: boolean; publicKey: string | null };
const DEVICE_DISABLED_KEY = 'beverly.vendor.push.disabled';

function deviceDisabled(): boolean {
    try { return localStorage.getItem(DEVICE_DISABLED_KEY) === '1'; } catch { return false; }
}

function setDeviceDisabled(disabled: boolean): void {
    try {
        if (disabled) localStorage.setItem(DEVICE_DISABLED_KEY, '1');
        else localStorage.removeItem(DEVICE_DISABLED_KEY);
    } catch { /* storage is best-effort */ }
}

function supported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function applicationServerKey(value: string): ArrayBuffer {
    const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
}

export function deviceNotificationState(): DeviceNotificationState {
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'granted') return deviceDisabled() ? 'default' : 'enabled';
    if (Notification.permission === 'denied') return 'blocked';
    return 'default';
}

async function subscribeDevice(config: PushConfig): Promise<DeviceNotificationState> {
    if (!config.available || !config.publicKey) return 'unavailable';
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey(config.publicKey),
        });
    }
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Push subscription is incomplete.');
    await api.post('/api/v1/vendor/push/subscription', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    return 'enabled';
}

export async function enableDeviceNotifications(): Promise<DeviceNotificationState> {
    if (!supported()) return 'unsupported';
    const config = await api.get<PushConfig>('/api/v1/vendor/push/config');
    if (!config.available) return 'unavailable';
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'default';
    const state = await subscribeDevice(config);
    setDeviceDisabled(false);
    return state;
}

export async function syncDeviceNotifications(): Promise<DeviceNotificationState> {
    if (deviceNotificationState() !== 'enabled') return deviceNotificationState();
    const config = await api.get<PushConfig>('/api/v1/vendor/push/config');
    return subscribeDevice(config);
}

export async function disableDeviceNotifications(): Promise<DeviceNotificationState> {
    if (!supported()) return 'unsupported';
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
        await api.del(`/api/v1/vendor/push/subscription?endpoint=${encodeURIComponent(subscription.endpoint)}`).catch(() => undefined);
        await subscription.unsubscribe();
    }
    setDeviceDisabled(true);
    return 'default';
}
