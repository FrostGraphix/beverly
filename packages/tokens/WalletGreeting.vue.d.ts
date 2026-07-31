import type { DefineComponent } from 'vue';

declare const WalletGreeting: DefineComponent<{
    audience: string;
    name: string;
    detail: string;
    languages?: Array<{
        key: string;
        morning: string;
        afternoon: string;
        night: string;
    }>;
}>;

export default WalletGreeting;
