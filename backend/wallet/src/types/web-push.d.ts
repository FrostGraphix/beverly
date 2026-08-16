declare module 'web-push' {
    interface Subscription {
        endpoint: string;
        keys: { p256dh: string; auth: string };
    }

    interface Options {
        vapidDetails: { subject: string; publicKey: string; privateKey: string };
        TTL?: number;
        urgency?: 'very-low' | 'low' | 'normal' | 'high';
    }

    const webpush: {
        sendNotification(subscription: Subscription, payload: string, options: Options): Promise<unknown>;
    };

    export default webpush;
}
