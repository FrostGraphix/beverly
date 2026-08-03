/**
 * Wallet-side OEM registry — Phase 6 unification.
 *
 * The CRM (api/reference.js + backend/src/services/oem-registry-service.js) and
 * this wallet backend are two SEPARATE deployables (Vercel serverless function vs
 * a standalone Fastify service on Fly.io/Railway) that share ONE Supabase project.
 * They cannot share a Node module at runtime, so this file is a parallel, minimal
 * port that reads the SAME `oem_manufacturers`/`oem_credentials` tables directly
 * via this service's own `adminClient`, using the SAME AES-256-GCM decryption
 * scheme (see backend/src/services/oem-credential-crypto.js — keep these two
 * files' crypto logic in sync if either ever changes).
 *
 * Every export here is designed to fail closed to `null`/legacy-env, never throw
 * — callers in token-engine.ts fall back to `env.ENERGY_BACKEND_URL`/
 * `env.ENERGY_BEARER_TOKEN` exactly as before whenever this resolves nothing,
 * which is what keeps the live, revenue-critical vending flow zero-regression.
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';

const DEFAULT_OEM_SLUG = 'calinmeter';
const CACHE_TTL_MS = env.OEM_CONFIG_CACHE_TTL_MS;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface OemLiveConfig {
    oemId: string;
    slug: string;
    displayName: string;
    isSeedDefault: boolean;
    vendingStrategy: 'sts_token' | 'direct_credit';
    authStrategy: 'bearer_static' | 'bearer_login' | 'api_key_header' | 'oauth2_client_credentials';
    baseUrl: string;
    bearerToken: string;
    apiKeyHeaderName: string;
    tokenEndpointPath: string;
    username: string;
    password: string;
}

let cachedKey: Buffer | null = null;
const insecureDevKey = crypto.createHash('sha256').update('beverly-local-oem-credentials-key-only').digest();

let keyWarningLogged = false;

function resolveKey(): Buffer {
    if (cachedKey) return cachedKey;
    const configured = String(env.OEM_CREDENTIALS_ENCRYPTION_KEY || '').trim();
    if (!configured) {
        if (!keyWarningLogged && env.NODE_ENV === 'production') {
            keyWarningLogged = true;
            console.warn('[wallet-oem-registry] OEM_CREDENTIALS_ENCRYPTION_KEY is not configured; falling back to default key.');
        }
        cachedKey = insecureDevKey;
        return cachedKey;
    }
    let key = Buffer.from(configured, 'base64');
    if (key.length !== 32) key = crypto.createHash('sha256').update(configured).digest();
    cachedKey = key;
    return cachedKey;
}

function decryptSecret(encoded: string | null | undefined): string {
    const raw = String(encoded || '').trim();
    if (!raw) return '';
    let buffer: Buffer;
    try {
        buffer = Buffer.from(raw, 'base64');
    } catch {
        return '';
    }
    if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH) return '';
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    try {
        const decipher = crypto.createDecipheriv(ALGORITHM, resolveKey(), iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (error) {
        console.error('[wallet-oem-registry] decrypt failed', error instanceof Error ? error.message : String(error));
        return '';
    }
}

function registryDisabled(): boolean {
    return env.OEM_REGISTRY_DISABLED === true;
}

const configCache = new Map<string, { config: OemLiveConfig | null; expiresAt: number }>();

function cacheKeyFor(oemIdOrSlug?: string | null): string {
    return String(oemIdOrSlug || DEFAULT_OEM_SLUG).trim().toLowerCase();
}

export function invalidateOemCache(oemIdOrSlug?: string): void {
    if (oemIdOrSlug) configCache.delete(cacheKeyFor(oemIdOrSlug));
    else configCache.clear();
}

async function loadOemConfig(oemIdOrSlug: string): Promise<OemLiveConfig | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(oemIdOrSlug);
    const { data: manufacturer } = await adminClient
        .from('oem_manufacturers')
        .select('id, slug, display_name, status, is_seed_default, vending_strategy')
        .eq(isUuid ? 'id' : 'slug', oemIdOrSlug)
        .maybeSingle();
    if (!manufacturer) return null;

    const { data: credentials } = await adminClient
        .from('oem_credentials')
        .select('auth_strategy, base_url, encrypted_bearer_token, encrypted_username, encrypted_password, token_endpoint_path, api_key_header_name')
        .eq('oem_id', manufacturer.id)
        .maybeSingle();

    return {
        oemId: manufacturer.id,
        slug: manufacturer.slug,
        displayName: manufacturer.display_name,
        isSeedDefault: Boolean(manufacturer.is_seed_default),
        vendingStrategy: (manufacturer.vending_strategy === 'direct_credit' ? 'direct_credit' : 'sts_token'),
        authStrategy: (credentials?.auth_strategy as OemLiveConfig['authStrategy']) || 'bearer_static',
        baseUrl: String(credentials?.base_url || '').trim().replace(/\/+$/, ''),
        bearerToken: credentials ? decryptSecret(credentials.encrypted_bearer_token) : '',
        apiKeyHeaderName: credentials?.api_key_header_name || '',
        tokenEndpointPath: credentials?.token_endpoint_path || '',
        // Kept encrypted at rest until the moment a dynamic-auth fetch needs them;
        // decrypted once per resolve here since (unlike the CRM proxy) the wallet
        // doesn't yet implement the login/OAuth2 token-cache flow — see the
        // "not yet implemented" note on resolveOemAuthHeader below.
        username: credentials ? decryptSecret(credentials.encrypted_username) : '',
        password: credentials ? decryptSecret(credentials.encrypted_password) : '',
    };
}

/**
 * Resolves an OEM's live config (base URL, decrypted token, strategy), with an
 * in-process TTL cache. Returns null on any failure — never throws.
 */
export async function resolveOemConfig(oemIdOrSlug?: string): Promise<OemLiveConfig | null> {
    if (registryDisabled()) return null;
    const key = cacheKeyFor(oemIdOrSlug);
    const cached = configCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.config;
    try {
        const config = await loadOemConfig(oemIdOrSlug || DEFAULT_OEM_SLUG);
        configCache.set(key, { config, expiresAt: Date.now() + CACHE_TTL_MS });
        return config;
    } catch (error) {
        console.error('[wallet-oem-registry] resolve failed', error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Resolves the auth header value to send for a given OEM config.
 *
 * NOTE: `bearer_login`/`oauth2_client_credentials` (the dynamic, fetch-and-cache-
 * a-token strategies) are fully implemented on the CRM side (oem-registry-
 * service.js) but NOT yet ported here — the wallet's vending path only exercises
 * `bearer_static`/`api_key_header` today, since Calinmeter (the only OEM with
 * real wallet traffic) uses a static token. Port the same fetchLoginToken/
 * fetchOAuth2Token logic here if/when a wallet-vending OEM needs one of those
 * strategies — until then this returns null for them, which correctly makes the
 * caller fall back to the legacy env-var path rather than silently vend with no
 * auth header.
 */
export function resolveOemAuthHeader(config: OemLiveConfig | null): { name: string; value: string } | null {
    if (!config) return null;
    if (config.authStrategy === 'api_key_header') {
        return config.bearerToken ? { name: config.apiKeyHeaderName || 'X-Api-Key', value: config.bearerToken } : null;
    }
    if (config.authStrategy === 'bearer_login' || config.authStrategy === 'oauth2_client_credentials') {
        return null;
    }
    return config.bearerToken ? { name: 'Authorization', value: `Bearer ${config.bearerToken}` } : null;
}

export { DEFAULT_OEM_SLUG };
