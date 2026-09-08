/**
 * Email Validation & Deliverability Service.
 *
 * Checks:
 * 1. Syntax validation
 * 2. Disposable / temporary email domain blacklist
 * 3. Pre-flight DNS MX record resolution (with 3s timeout & test-mode bypass)
 * 4. Corporate domain restriction for staff accounts
 */
import dns from 'node:dns';

export class EmailValidationError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'EmailValidationError';
    }
}

export const DISPOSABLE_DOMAINS = new Set<string>([
    'mailinator.com',
    'tempmail.com',
    'tempmail.org',
    '10minutemail.com',
    'guerrillamail.com',
    'guerrillamail.net',
    'guerrillamail.org',
    'throwawaymail.com',
    'yopmail.com',
    'yopmail.fr',
    'yopmail.net',
    'trashmail.com',
    'sharklasers.com',
    'getnada.com',
    'maildrop.cc',
    'dispostable.com',
    'mohmal.com',
    'inboxalias.com',
    'fakeinbox.com',
    'crazymailing.com',
    'temp-mail.org',
    'generator.email',
    'byom.de',
    '0815.ru',
    '10minutemail.co.za',
    '20minutemail.com',
]);

export function extractEmailDomain(email: string): string {
    const parts = email.trim().toLowerCase().split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new EmailValidationError('Enter a valid email address.', 'invalid_email');
    }
    return parts[1].replace(/\.$/, '');
}

export function isDisposableEmail(email: string): boolean {
    try {
        const domain = extractEmailDomain(email);
        return DISPOSABLE_DOMAINS.has(domain);
    } catch {
        return false;
    }
}

export function isCorporateStaffEmail(email: string): boolean {
    try {
        const domain = extractEmailDomain(email);
        return domain === 'acoblighting.com';
    } catch {
        return false;
    }
}

export async function validateEmailFormatAndDomain(email: string): Promise<string> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        throw new EmailValidationError('Enter a valid email address.', 'invalid_email');
    }

    const domain = extractEmailDomain(normalized);

    if (DISPOSABLE_DOMAINS.has(domain)) {
        throw new EmailValidationError(
            'Disposable or temporary email addresses are not allowed.',
            'disposable_email_not_allowed',
        );
    }

    // In test environment, skip network DNS MX lookup for fast offline test runs.
    if (process.env.NODE_ENV === 'test') {
        return normalized;
    }

    try {
        const mxPromise = dns.promises.resolveMx(domain);
        const timeoutPromise = new Promise<never>((_, reject) => {
            const timer = setTimeout(() => reject(new Error('DNS_TIMEOUT')), 3000);
            if (typeof timer.unref === 'function') timer.unref();
        });

        const records = (await Promise.race([mxPromise, timeoutPromise])) as dns.MxRecord[];
        if (!records || records.length === 0) {
            throw new EmailValidationError(
                'The email domain has no mail servers configured to receive emails.',
                'invalid_email_domain',
            );
        }
    } catch (err: any) {
        if (err instanceof EmailValidationError) throw err;
        if (err.message === 'DNS_TIMEOUT') {
            // DNS resolution timed out; allow gracefully to prevent blocking users on slow network
        } else if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'EREFUSED') {
            throw new EmailValidationError(
                'The email domain does not exist or cannot receive email.',
                'invalid_email_domain',
            );
        }
    }

    return normalized;
}
