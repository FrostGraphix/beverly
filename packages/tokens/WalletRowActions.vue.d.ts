import { DefineComponent } from 'vue';

export interface ActionItem {
    label: string;
    icon?: string;
    action: () => void;
    tone?: 'default' | 'primary' | 'danger';
    disabled?: boolean;
}

declare const WalletRowActions: DefineComponent<Record<string, any>, Record<string, any>, any>;
export default WalletRowActions;
