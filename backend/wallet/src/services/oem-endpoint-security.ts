import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface DnsAddress {
    address: string;
    family: number;
}

export type DnsLookup = (hostname: string) => Promise<readonly DnsAddress[]>;

export class OemEndpointSecurityError extends Error {
    constructor(
        public readonly code:
            | 'OEM_ENDPOINT_INVALID'
            | 'OEM_ENDPOINT_FORBIDDEN'
            | 'OEM_ENDPOINT_DNS_FAILED'
            | 'OEM_ENDPOINT_PRIVATE_NETWORK',
        message: string,
    ) {
        super(message);
        this.name = 'OemEndpointSecurityError';
    }
}

const systemLookup: DnsLookup = async (hostname) => lookup(hostname, { all: true, verbatim: true });

function isNonPublicIpv4(address: string): boolean {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [first, second, third] = parts;
    return first === 0
        || first === 10
        || first === 127
        || (first === 100 && second >= 64 && second <= 127)
        || (first === 169 && second === 254)
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 0 && third === 0)
        || (first === 192 && second === 0 && third === 2)
        || (first === 192 && second === 168)
        || (first === 198 && (second === 18 || second === 19))
        || (first === 198 && second === 51 && third === 100)
        || (first === 203 && second === 0 && third === 113)
        || first >= 224;
}

function isNonPublicIp(address: string): boolean {
    const normalized = address.trim().toLowerCase();
    const family = isIP(normalized);
    if (family === 4) return isNonPublicIpv4(normalized);
    if (family !== 6) return true;
    if (normalized === '::' || normalized === '::1') return true;
    if (/^f[cd]/.test(normalized) || /^fe[89ab]/.test(normalized)) return true;
    const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mappedIpv4 ? isNonPublicIpv4(mappedIpv4) : false;
}

function parseEndpoint(baseUrl: string): URL {
    let endpoint: URL;
    try {
        endpoint = new URL(baseUrl);
    } catch {
        throw new OemEndpointSecurityError('OEM_ENDPOINT_INVALID', 'OEM endpoint URL is invalid');
    }
    if (endpoint.protocol !== 'https:'
        || endpoint.username
        || endpoint.password
        || endpoint.port
        || endpoint.hash
        || endpoint.search) {
        throw new OemEndpointSecurityError('OEM_ENDPOINT_INVALID', 'OEM endpoint URL is unsafe');
    }
    return endpoint;
}

/** Validate one configured OEM origin before any network request. */
export async function validateOemEndpoint(
    baseUrl: string,
    approvedHostnames: readonly string[],
    dnsLookup: DnsLookup = systemLookup,
): Promise<string> {
    const endpoint = parseEndpoint(baseUrl);
    const approved = new Set(approvedHostnames.map((hostname) => hostname.trim().toLowerCase()).filter(Boolean));
    if (!approved.has(endpoint.hostname.toLowerCase())) {
        throw new OemEndpointSecurityError('OEM_ENDPOINT_FORBIDDEN', 'OEM endpoint hostname is not approved');
    }

    let addresses: readonly DnsAddress[];
    try {
        addresses = await dnsLookup(endpoint.hostname);
    } catch {
        throw new OemEndpointSecurityError('OEM_ENDPOINT_DNS_FAILED', 'OEM endpoint DNS resolution failed');
    }
    if (addresses.length === 0) {
        throw new OemEndpointSecurityError('OEM_ENDPOINT_DNS_FAILED', 'OEM endpoint DNS resolution returned no addresses');
    }
    if (addresses.some(({ address }) => isNonPublicIp(address))) {
        throw new OemEndpointSecurityError('OEM_ENDPOINT_PRIVATE_NETWORK', 'OEM endpoint resolved outside public networks');
    }
    return endpoint.toString();
}
