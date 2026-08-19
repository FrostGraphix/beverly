import { DefineComponent } from 'vue';

export interface FilterOption {
  label: string;
  value: string;
}

export declare const WalletTableFilterBar: DefineComponent<{
  title?: string;
  subtitle?: string;
  totalCount?: number;
  loading?: boolean;
  searchQuery?: string;
  searchPlaceholder?: string;
  statusFilter?: string;
  statusOptions?: FilterOption[];
  exportRange?: string;
  rangeOptions?: FilterOption[];
  exporting?: boolean;
  exportLabel?: string;
  viewMode?: 'table' | 'list';
  showViewSwitch?: boolean;
  showExport?: boolean;
  showStatusFilter?: boolean;
  showSearch?: boolean;
}>;

export default WalletTableFilterBar;
