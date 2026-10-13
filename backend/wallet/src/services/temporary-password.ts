import crypto from 'node:crypto';
import { evaluateVendorPassword } from '@beverly/tokens/password-policy';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(characters: string): string {
    return characters[crypto.randomInt(characters.length)];
}

/** Generate a cryptographic password accepted by the shared vendor policy. */
export function generateTemporaryPassword(length = 20): string {
    if (!Number.isInteger(length) || length < 12 || length > 128) {
        throw new RangeError('Temporary password length must be between 12 and 128.');
    }
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const characters = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
        while (characters.length < length) characters.push(pick(ALL));
        for (let index = characters.length - 1; index > 0; index -= 1) {
            const swapIndex = crypto.randomInt(index + 1);
            [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
        }
        const password = characters.join('');
        if (evaluateVendorPassword(password).valid) return password;
    }
    throw new Error('Unable to generate a policy-compliant temporary password.');
}
