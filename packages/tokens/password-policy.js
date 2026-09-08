export const VENDOR_PASSWORD_MIN_LENGTH = 12;

const COMMON_PATTERN = /(123|abc|password|qwerty|beverly)/i;

export function evaluateVendorPassword(password) {
  const value = String(password ?? '');
  const checks = [
    { key: 'length', ok: value.length >= VENDOR_PASSWORD_MIN_LENGTH, label: 'At least 12 characters' },
    { key: 'mixed_case', ok: /[A-Z]/.test(value) && /[a-z]/.test(value), label: 'Mixed case letters' },
    { key: 'number', ok: /\d/.test(value), label: 'A number' },
    { key: 'symbol', ok: /[^A-Za-z0-9]/.test(value), label: 'A symbol (! # $ …)' },
    { key: 'not_common', ok: !COMMON_PATTERN.test(value), label: 'Not a common pattern' },
  ];
  const passed = checks.filter((check) => check.ok).length;
  return {
    valid: checks.every((check) => check.ok),
    score: value.length ? Math.min(4, Math.max(1, passed - 1)) : 0,
    checks,
  };
}

export function vendorPasswordError(password) {
  const result = evaluateVendorPassword(password);
  if (result.valid) return null;
  const missing = result.checks.filter((check) => !check.ok).map((check) => check.label.toLowerCase());
  return `Password must include ${missing.join(', ')}.`;
}
