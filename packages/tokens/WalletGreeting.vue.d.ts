import type { DefineComponent } from 'vue';

declare const WalletGreeting: DefineComponent<{
    audience: string;
    name: string;
    detail: string;
}>;

export default WalletGreeting;
