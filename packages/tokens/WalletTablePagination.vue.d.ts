import { DefineComponent } from 'vue';

declare const WalletTablePagination: DefineComponent<{
  page?: number;
  pageSize?: number;
  totalItems?: number;
  itemLabel?: string;
  loading?: boolean;
}>;

export default WalletTablePagination;
