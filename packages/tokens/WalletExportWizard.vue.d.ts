import type { DefineComponent, PropType } from 'vue';
import type { WalletExportColumn, WalletExportMeta } from './wallet-export';
import type { WalletExportOption, WalletExportSelection } from './wallet-export-wizard';
export type { WalletExportOption, WalletExportSelection } from './wallet-export-wizard';

declare const component: DefineComponent<{
  rows: { type: PropType<Record<string, any>[]>; required: true };
  columns: { type: PropType<WalletExportColumn<any>[]>; required: true };
  filename: { type: StringConstructor; required: true };
  title: { type: StringConstructor; required: true };
  subtitle: { type: StringConstructor; default: string };
  meta: { type: PropType<WalletExportMeta[]>; default: () => WalletExportMeta[] };
  loading: { type: BooleanConstructor; default: boolean };
  label: { type: StringConstructor; default: string };
  formats: { type: PropType<Array<'csv' | 'pdf'>>; default: () => Array<'csv' | 'pdf'> };
  statusOptions: { type: PropType<WalletExportOption[]>; default: () => WalletExportOption[] };
  stationOptions: { type: PropType<WalletExportOption[]>; default: () => WalletExportOption[] };
  actorOptions: { type: PropType<WalletExportOption[]>; default: () => WalletExportOption[] };
  statusLabel: { type: StringConstructor; default: string };
  stationLabel: { type: StringConstructor; default: string };
  actorLabel: { type: StringConstructor; default: string };
  allStatusLabel: { type: StringConstructor; default: string };
  allStationLabel: { type: StringConstructor; default: string };
  allActorLabel: { type: StringConstructor; default: string };
  hoverTitle: { type: StringConstructor; default: string };
  hoverDescription: { type: StringConstructor; default: string };
  initialStatus: { type: StringConstructor; default: string };
  initialStation: { type: StringConstructor; default: string };
  initialActor: { type: StringConstructor; default: string };
  initialSince: { type: StringConstructor; default: string };
  initialUntil: { type: StringConstructor; default: string };
  dateValue: { type: PropType<(row: any) => string | null | undefined> };
  statusValue: { type: PropType<(row: any) => string | null | undefined> };
  stationValue: { type: PropType<(row: any) => string | null | undefined> };
  actorValue: { type: PropType<(row: any) => string | null | undefined> };
  resolveRows: { type: PropType<(selection: WalletExportSelection) => Promise<any[]>> };
}>;

export default component;
