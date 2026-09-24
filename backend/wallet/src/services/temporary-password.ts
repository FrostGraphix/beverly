import crypto from 'node:crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(characters: string): string {
    return characters[crypto.randomInt(characters.length)];
}

export function generateTemporaryPassword(length = 20): string {
    if (!Number.isInteger(length) || length < 12 || length > 128) {
        throw new RangeError('Temporary password length must be between 12 and 128.');
    }
    const characters = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
    while (characters.length < length) characters.push(pick(ALL));
    for (let index = characters.length - 1; index > 0; index -= 1) {
        const swapIndex = crypto.randomInt(index + 1);
        [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
    }
    return characters.join('');
}
