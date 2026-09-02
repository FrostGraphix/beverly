export interface WalletExportOption {
  label: string;
  value: string;
  description?: string;
}

export interface WalletExportSelection {
  format: 'csv' | 'pdf';
  since: string;
  until: string;
  status: string;
  station: string;
  actor: string;
  columnKeys: string[];
}
