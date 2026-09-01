import type { DefineComponent, PropType } from 'vue';
import type { WalletExportColumn, WalletExportMeta } from './wallet-export';

declare const component: DefineComponent<{
    rows: { type: PropType<Record<string, any>[]>; required: true };
    columns: { type: PropType<WalletExportColumn<any>[]>; required: true };
    filename: { type: StringConstructor; required: true };
    title: { type: StringConstructor; required: true };
    subtitle: { type: StringConstructor; default: string };
    meta: { type: PropType<WalletExportMeta[]>; default: () => WalletExportMeta[] };
    loading: { type: BooleanConstructor; default: boolean };
    label: { type: StringConstructor; default: string };
}>;

export default component;

