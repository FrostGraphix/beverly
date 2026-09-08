export interface VendorPasswordCheck {
  key: 'length' | 'mixed_case' | 'number' | 'symbol' | 'not_common';
  ok: boolean;
  label: string;
}

export interface VendorPasswordEvaluation {
  valid: boolean;
  score: number;
  checks: VendorPasswordCheck[];
}

export declare const VENDOR_PASSWORD_MIN_LENGTH: number;
export declare function evaluateVendorPassword(password: unknown): VendorPasswordEvaluation;
export declare function vendorPasswordError(password: unknown): string | null;
