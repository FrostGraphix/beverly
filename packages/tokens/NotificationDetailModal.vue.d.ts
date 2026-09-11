import type { DefineComponent } from 'vue';

declare const NotificationDetailModal: DefineComponent<{
    notification: {
        title: string;
        body: string;
        metadata?: { path?: string } | Record<string, unknown>;
    };
    typeLabel?: string;
    formattedDate?: string;
    actionLabel?: string;
}>;

export default NotificationDetailModal;
