import { describe, expect, it } from 'vitest';
import {
    validateOemEndpoint,
    type DnsLookup,
} from '../oem-endpoint-security.js';

const publicLookup: DnsLookup = async () => [
    { address: '8.8.8.8', family: 4 },
    { address: '2001:4860:4860::8888', family: 6 },
];

describe('OEM endpoint security', () => {
    it('accepts an allowlisted HTTPS endpoint with public DNS', async () => {
        await expect(validateOemEndpoint(
            'https://api.example.com',
            ['api.example.com'],
            publicLookup,
        )).resolves.toBe('https://api.example.com/');
    });

    it.each([
        'http://api.example.com',
        'https://user:secret@api.example.com',
        'https://api.example.com:8443',
        'https://api.example.com/#fragment',
    ])('rejects unsafe URL %s', async (url) => {
        await expect(validateOemEndpoint(url, ['api.example.com'], publicLookup))
            .rejects.toMatchObject({ code: 'OEM_ENDPOINT_INVALID' });
    });

    it('rejects non-allowlisted hosts', async () => {
        await expect(validateOemEndpoint(
            'https://other.example.com',
            ['api.example.com'],
            publicLookup,
        )).rejects.toMatchObject({ code: 'OEM_ENDPOINT_FORBIDDEN' });
    });

    it.each([
        '127.0.0.1',
        '10.0.0.1',
        '172.16.0.1',
        '192.168.0.1',
        '169.254.1.1',
        '100.64.0.1',
        '::1',
        'fc00::1',
        'fe80::1',
        '::ffff:127.0.0.1',
    ])('rejects private address %s', async (address) => {
        const lookup: DnsLookup = async () => [{
            address,
            family: address.includes(':') ? 6 : 4,
        }];
        await expect(validateOemEndpoint(
            'https://api.example.com',
            ['api.example.com'],
            lookup,
        )).rejects.toMatchObject({ code: 'OEM_ENDPOINT_PRIVATE_NETWORK' });
    });

    it('rejects unresolved hosts', async () => {
        const lookup: DnsLookup = async () => [];
        await expect(validateOemEndpoint(
            'https://api.example.com',
            ['api.example.com'],
            lookup,
        )).rejects.toMatchObject({ code: 'OEM_ENDPOINT_DNS_FAILED' });
    });
});
