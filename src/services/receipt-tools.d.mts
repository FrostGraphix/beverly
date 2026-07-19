export interface CanonicalReceiptField {
  label: string;
  value: unknown;
  isToken?: boolean;
  emphasis?: boolean;
  section?: string;
}

export interface CanonicalReceiptModel {
  title: string;
  subtitle: string;
  receiptId: string;
  amount?: string;
  generatedAt: string;
  brand: { name: string; company: string; email: string; phone: string; web: string; address: string };
  fields: CanonicalReceiptField[];
}

export function receiptHtml(model: CanonicalReceiptModel, options?: Record<string, unknown>): string;
export function downloadReceiptPdf(model: CanonicalReceiptModel): Promise<void>;
