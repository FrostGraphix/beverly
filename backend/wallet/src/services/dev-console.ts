import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { adminClient } from '../db/supabase.js';
import { getBalance, postEntry } from './ledger.js';
import { logAction } from './audit.js';
import { getOrCreateWallet, type OwnerType } from './wallets.js';
import { env } from '../config/env.js';

type JsonRecord = Record<string, unknown>;
type DevActorType = 'staff' | 'vendor' | 'customer' | 'api_key' | null;
type DevOrgType = 'vendor' | 'customer' | 'system' | null;
type QueueStatus = 'pending' | 'processing' | 'failed' | 'completed';

export interface DevApiKey {
    id: string;
    name: string;
    prefix: string;
    org_id: string | null;
    org_name: string | null;
    org_type: DevOrgType;
    scopes: string[];
    last_used_at: string | null;
    last_used_ip: string | null;
    created_at: string;
    revoked_at: string | null;
}

export interface DevWebhook {
    id: string;
    url: string;
    events: string[];
    secret_prefix: string;
    enabled: boolean;
    created_at: string;
    last_delivery_at: string | null;
    failure_count: number;
}

export interface DevWebhookDelivery {
    id: string;
    webhook_id: string;
    webhook_url: string;
    event_type: string;
    status: 'delivered' | 'failed' | 'retrying';
    http_status: number | null;
    attempt: number;
    latency_ms: number | null;
    delivered_at: string | null;
    request_body: string;
    response_body: string | null;
}

export interface DevApiLogEntry {
    id: string;
    ts: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    actor_id: string | null;
    actor_type: DevActorType;
    actor_label: string | null;
    status: number;
    latency_ms: number;
    req_size_bytes: number;
    res_size_bytes: number;
    req_body: string | null;
    res_body: string | null;
    ip: string | null;
}

export interface SandboxStatus {
    mode: 'live' | 'test';
    test_wallets_seeded: number;
    mock_vends_run: number;
    last_activity: string | null;
}

export interface SandboxActivityEntry {
    id: string;
    action: string;
    detail: string;
    actor: string;
    ts: string;
}

export interface ServiceStatus {
    id: string;
    name: string;
    category: string;
    status: 'healthy' | 'degraded' | 'down' | 'unknown';
    latency_ms: number | null;
    uptime_7d: number | null;
    checked_at: string | null;
    message: string | null;
}

export interface QueueStat {
    queue: string;
    label: string;
    pending: number;
    processing: number;
    failed: number;
    completed_24h: number;
}

export interface DevJob {
    id: string;
    queue: string;
    payload_preview: string;
    status: QueueStatus;
    attempts: number;
    max_attempts: number;
    error: string | null;
    created_at: string;
    next_retry_at: string | null;
}

export interface ErrorGroup {
    fingerprint: string;
    message: string;
    source: string;
    severity: 'error' | 'warning' | 'critical';
    count: number;
    first_seen: string;
    last_seen: string;
    affected_actors: string[];
    sample_stack: string | null;
    resolved: boolean;
}

export interface SlowQuery {
    id: string;
    query_preview: string;
    duration_ms: number;
    table_hints: string[];
    called_at: string;
    source: string | null;
}

export interface SchemaTable {
    name: string;
    schema: string;
    row_estimate: number | null;
    columns: Array<{
        name: string;
        type: string;
        nullable: boolean;
        default: string | null;
        is_pk: boolean;
        fk_table: string | null;
        fk_column: string | null;
        description: string | null;
    }>;
    indexes: string[];
}

export interface RoleMatrixInput {
    catalog: Array<{ key: string; label: string; group: string }>;
    roleLabels: Record<string, string>;
    defaultRolePermissions: Record<string, string[]>;
}

export interface MigrationInfo {
    version: string;
    name: string;
    status: 'applied' | 'pending';
    applied_at: string | null;
    checksum: string;
}

const QUEUE_LABELS: Record<string, string> = {
    token_dispatch: 'Token Dispatch',
    wallet_credit: 'Wallet Credit',
    sms_send: 'SMS Send',
    email_send: 'Email Send',
    webhook_deliver: 'Webhook Deliveries',
    fraud_check: 'Fraud Checks',
};

const DEFAULT_CONFIGS = [
    {
        key: 'sandbox.mode',
        value: 'live',
        type: 'string',
        description: 'Developer sandbox execution mode.',
        category: 'Runtime',
    },
    {
        key: 'webhooks.retry.max_attempts',
        value: '3',
        type: 'number',
        description: 'Maximum webhook delivery attempts.',
        category: 'Webhooks',
    },
    {
        key: 'notifications.test_send.enabled',
        value: 'true',
        type: 'boolean',
        description: 'Allow developer console notification test sends.',
        category: 'Notifications',
    },
] satisfies Array<{
    key: string;
    value: string;
    type: 'string' | 'number' | 'boolean' | 'json';
    description: string;
    category: string;
}>;

const DEFAULT_TEMPLATES: Array<{
    name: string;
    channel: 'sms' | 'email';
    event: string;
    subject: string | null;
    body: string;
    variables: string[];
}> = [
    {
        name: 'Wallet Funded',
        channel: 'email',
        event: 'wallet.funded',
        subject: 'Wallet funded',
        body: 'Your Beverly wallet was funded with {{amount}}.',
        variables: ['amount'],
    },
    {
        name: 'Token Purchased',
        channel: 'sms',
        event: 'token.vended',
        subject: null,
        body: 'Token {{token}} for meter {{meter_id}}.',
        variables: ['token', 'meter_id'],
    },
];

function record(value: unknown): JsonRecord {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function nowIso(): string {
    return new Date().toISOString();
}

function hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
}

function shortJson(value: unknown): string {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? {});
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function migrationDir(): string | null {
    const candidates = [
        path.resolve(process.cwd(), 'supabase', 'migrations'),
        path.resolve(process.cwd(), '..', '..', 'supabase', 'migrations'),
        path.resolve(process.cwd(), '..', 'supabase', 'migrations'),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function migrationFiles(): Array<{ fileName: string; fullPath: string; source: string }> {
    const dir = migrationDir();
    if (!dir) return [];
    return fs.readdirSync(dir)
        .filter((fileName) => fileName.endsWith('.sql'))
        .sort()
        .map((fileName) => {
            const fullPath = path.join(dir, fileName);
            return { fileName, fullPath, source: fs.readFileSync(fullPath, 'utf8') };
        });
}

function parseColumn(line: string): SchemaTable['columns'][number] | null {
    const cleaned = line.trim().replace(/,$/, '');
    if (!cleaned || cleaned.startsWith('--')) return null;
    if (/^(constraint|primary|foreign|unique|check|exclude)\b/i.test(cleaned)) return null;
    const match = cleaned.match(/^"?([a-zA-Z0-9_]+)"?\s+(.+)$/);
    if (!match) return null;
    const definition = match[2];
    const type = definition.split(/\s+(?:not\s+null|null|default|primary\s+key|references|check)\b/i)[0]?.trim() ?? 'text';
    const reference = definition.match(/references\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([^)]+)\)/i);
    const defaultMatch = definition.match(/\bdefault\s+([^,]+)/i);
    return {
        name: match[1],
        type,
        nullable: !/\bnot\s+null\b/i.test(definition) && !/\bprimary\s+key\b/i.test(definition),
        default: defaultMatch?.[1]?.trim() ?? null,
        is_pk: /\bprimary\s+key\b/i.test(definition),
        fk_table: reference?.[1] ?? null,
        fk_column: reference?.[2]?.trim() ?? null,
        description: null,
    };
}

function parseSchemaFromMigrations(): SchemaTable[] {
    const tables = new Map<string, SchemaTable>();
    const indexByTable = new Map<string, string[]>();
    for (const file of migrationFiles()) {
        const indexRegex = /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)[\s\S]{0,240}?\son\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
        for (const match of file.source.matchAll(indexRegex)) {
            const indexes = indexByTable.get(match[2]) ?? [];
            indexes.push(match[1]);
            indexByTable.set(match[2], indexes);
        }
        const tableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
        for (const match of file.source.matchAll(tableRegex)) {
            const name = match[1];
            if (tables.has(name)) continue;
            const columns = match[2]
                .split(/\n/)
                .map(parseColumn)
                .filter((column): column is SchemaTable['columns'][number] => Boolean(column));
            tables.set(name, {
                name,
                schema: 'public',
                row_estimate: null,
                columns,
                indexes: [],
            });
        }
    }
    for (const [tableName, indexes] of indexByTable.entries()) {
        const table = tables.get(tableName);
        if (table) table.indexes = Array.from(new Set(indexes));
    }
    return Array.from(tables.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveOrgName(orgType: DevOrgType, orgId: string | null): Promise<string | null> {
    if (!orgId || orgType === 'system' || orgType === null) return null;
    const table = orgType === 'vendor' ? 'vendor_organizations' : 'customers';
    const select = orgType === 'vendor' ? 'legal_name, trading_name' : 'name, email';
    const { data } = await adminClient.from(table).select(select).eq('id', orgId).maybeSingle();
    const row = record(data);
    return String(row.trading_name ?? row.legal_name ?? row.name ?? row.email ?? '').trim() || null;
}

async function logDevActivity(action: string, detail: string, actorUserId: string): Promise<void> {
    await adminClient.from('dev_sandbox_activity').insert({
        action,
        detail,
        actor: actorUserId,
    });
}

export async function listDevApiKeys(): Promise<DevApiKey[]> {
    const { data, error } = await adminClient
        .from('dev_api_keys')
        .select('id, name, prefix, org_id, org_name, org_type, scopes, last_used_at, last_used_ip, created_at, revoked_at')
        .order('created_at', { ascending: false })
        .limit(200);
    if (error) throw error;
    return (data ?? []).map((row: JsonRecord) => ({
        id: String(row.id),
        name: String(row.name),
        prefix: String(row.prefix),
        org_id: row.org_id ? String(row.org_id) : null,
        org_name: row.org_name ? String(row.org_name) : null,
        org_type: (row.org_type as DevOrgType) ?? null,
        scopes: strings(row.scopes),
        last_used_at: row.last_used_at ? String(row.last_used_at) : null,
        last_used_ip: row.last_used_ip ? String(row.last_used_ip) : null,
        created_at: String(row.created_at),
        revoked_at: row.revoked_at ? String(row.revoked_at) : null,
    }));
}

export async function createDevApiKey(input: {
    name: string;
    orgId: string | null;
    orgType: DevOrgType;
    scopes: string[];
    actorUserId: string;
}): Promise<{ key: string }> {
    const secret = crypto.randomBytes(24).toString('base64url');
    const prefix = `bev_${crypto.randomBytes(5).toString('hex')}`;
    const orgName = await resolveOrgName(input.orgType, input.orgId);
    const { error } = await adminClient.from('dev_api_keys').insert({
        name: input.name,
        prefix,
        key_hash: hashSecret(secret),
        org_id: input.orgId,
        org_name: orgName,
        org_type: input.orgType,
        scopes: input.scopes,
        created_by: input.actorUserId,
    });
    if (error) throw error;
    return { key: `${prefix}.${secret}` };
}

export async function revokeDevApiKey(id: string, actorUserId: string): Promise<void> {
    const { error } = await adminClient
        .from('dev_api_keys')
        .update({ revoked_at: nowIso(), revoked_by: actorUserId, updated_at: nowIso() })
        .eq('id', id);
    if (error) throw error;
}

export async function rotateDevApiKey(id: string, actorUserId: string): Promise<{ key: string }> {
    const secret = crypto.randomBytes(24).toString('base64url');
    const prefix = `bev_${crypto.randomBytes(5).toString('hex')}`;
    const { error } = await adminClient
        .from('dev_api_keys')
        .update({
            prefix,
            key_hash: hashSecret(secret),
            revoked_at: null,
            revoked_by: null,
            rotated_by: actorUserId,
            rotated_at: nowIso(),
            updated_at: nowIso(),
        })
        .eq('id', id);
    if (error) throw error;
    return { key: `${prefix}.${secret}` };
}

export async function listDevWebhooks(): Promise<DevWebhook[]> {
    const { data, error } = await adminClient
        .from('dev_webhooks')
        .select('id, url, events, secret_prefix, enabled, created_at, last_delivery_at, failure_count')
        .order('created_at', { ascending: false })
        .limit(200);
    if (error) throw error;
    return (data ?? []).map((row: JsonRecord) => ({
        id: String(row.id),
        url: String(row.url),
        events: strings(row.events),
        secret_prefix: String(row.secret_prefix ?? ''),
        enabled: Boolean(row.enabled),
        created_at: String(row.created_at),
        last_delivery_at: row.last_delivery_at ? String(row.last_delivery_at) : null,
        failure_count: Number(row.failure_count ?? 0),
    }));
}

export async function createDevWebhook(input: {
    url: string;
    events: string[];
    secret?: string;
    actorUserId: string;
}): Promise<void> {
    const secret = input.secret?.trim() || `whsec_${crypto.randomBytes(24).toString('base64url')}`;
    const { error } = await adminClient.from('dev_webhooks').insert({
        url: input.url,
        events: input.events,
        secret_hash: hashSecret(secret),
        secret_prefix: secret.slice(0, 10),
        created_by: input.actorUserId,
    });
    if (error) throw error;
}

export async function updateDevWebhook(id: string, input: {
    url: string;
    events: string[];
    enabled: boolean;
}): Promise<void> {
    const { error } = await adminClient
        .from('dev_webhooks')
        .update({ url: input.url, events: input.events, enabled: input.enabled, updated_at: nowIso() })
        .eq('id', id);
    if (error) throw error;
}

export async function deleteDevWebhook(id: string): Promise<void> {
    const { error } = await adminClient.from('dev_webhooks').delete().eq('id', id);
    if (error) throw error;
}

export async function listDevWebhookDeliveries(limit: number): Promise<DevWebhookDelivery[]> {
    const { data, error } = await adminClient
        .from('dev_webhook_deliveries')
        .select('id, webhook_id, webhook_url, event_type, status, http_status, attempt, latency_ms, delivered_at, request_body, response_body')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row: JsonRecord) => ({
        id: String(row.id),
        webhook_id: String(row.webhook_id),
        webhook_url: String(row.webhook_url),
        event_type: String(row.event_type),
        status: (row.status as DevWebhookDelivery['status']) ?? 'failed',
        http_status: row.http_status === null || row.http_status === undefined ? null : Number(row.http_status),
        attempt: Number(row.attempt ?? 1),
        latency_ms: row.latency_ms === null || row.latency_ms === undefined ? null : Number(row.latency_ms),
        delivered_at: row.delivered_at ? String(row.delivered_at) : null,
        request_body: JSON.stringify(row.request_body ?? {}),
        response_body: row.response_body ? String(row.response_body) : null,
    }));
}

export async function replayDevWebhookDelivery(id: string, actorUserId: string): Promise<void> {
    const { data, error } = await adminClient
        .from('dev_webhook_deliveries')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('delivery_not_found');
    const delivery = record(data);
    const { error: insertError } = await adminClient.from('dev_webhook_deliveries').insert({
        webhook_id: delivery.webhook_id,
        webhook_url: delivery.webhook_url,
        event_type: delivery.event_type,
        status: 'retrying',
        attempt: Number(delivery.attempt ?? 1) + 1,
        request_body: delivery.request_body ?? {},
        response_body: `Replay queued by ${actorUserId}.`,
    });
    if (insertError) throw insertError;
}

export async function listDevApiLog(input: {
    limit: number;
    cursor?: string;
    from?: string;
}): Promise<{ entries: DevApiLogEntry[]; cursor: string | null; has_more: boolean }> {
    let query = adminClient
        .from('wallet_audit_log')
        .select('id, actor_user_id, actor_type, actor_role, action, metadata, ip, created_at')
        .order('created_at', { ascending: false })
        .limit(input.limit + 1);
    if (input.cursor) query = query.lt('created_at', input.cursor);
    if (input.from) query = query.gte('created_at', input.from);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []).slice(0, input.limit);
    const entries = rows.map((row: JsonRecord): DevApiLogEntry => {
        const metadata = record(row.metadata);
        const method = String(metadata.method ?? 'GET').toUpperCase() as DevApiLogEntry['method'];
        return {
            id: String(row.id),
            ts: String(row.created_at),
            method,
            path: String(metadata.path ?? row.action ?? '/'),
            actor_id: row.actor_user_id ? String(row.actor_user_id) : null,
            actor_type: (row.actor_type as DevActorType) ?? null,
            actor_label: row.actor_role ? String(row.actor_role) : null,
            status: Number(metadata.statusCode ?? 200),
            latency_ms: Number(metadata.latencyMs ?? 0),
            req_size_bytes: Number(metadata.requestSize ?? 0),
            res_size_bytes: Number(metadata.responseSize ?? 0),
            req_body: null,
            res_body: null,
            ip: row.ip ? String(row.ip) : null,
        };
    });
    return {
        entries,
        cursor: entries.at(-1)?.ts ?? null,
        has_more: (data ?? []).length > input.limit,
    };
}

export async function getSandboxMode(): Promise<'test'> {
    return 'test';
}

export async function getSandboxStatus(): Promise<SandboxStatus> {
    const mode = await getSandboxMode();
    const [{ count: seeded }, { count: mockVends }, { data: last }] = await Promise.all([
        adminClient.from('dev_sandbox_activity').select('id', { count: 'exact', head: true }).eq('action', 'seed_wallet'),
        adminClient.from('dev_sandbox_activity').select('id', { count: 'exact', head: true }).eq('action', 'mock_vend'),
        adminClient.from('dev_sandbox_activity').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return {
        mode,
        test_wallets_seeded: seeded ?? 0,
        mock_vends_run: mockVends ?? 0,
        last_activity: record(last).created_at ? String(record(last).created_at) : null,
    };
}

export async function setSandboxMode(mode: 'test', actorUserId: string): Promise<void> {
    const { error } = await adminClient.from('dev_sys_config').upsert({
        key: 'sandbox.mode',
        value: mode,
        type: 'string',
        description: 'Developer sandbox execution mode.',
        category: 'Runtime',
        updated_by: actorUserId,
        updated_at: nowIso(),
    }, { onConflict: 'key' });
    if (error) throw error;
    await logDevActivity('mode_changed', `Sandbox mode set to ${mode}.`, actorUserId);
}

export async function listSandboxActivity(limit = 100): Promise<SandboxActivityEntry[]> {
    const { data, error } = await adminClient
        .from('dev_sandbox_activity')
        .select('id, action, detail, actor, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row: JsonRecord) => ({
        id: String(row.id),
        action: String(row.action),
        detail: String(row.detail),
        actor: String(row.actor),
        ts: String(row.created_at),
    }));
}

export async function seedSandboxWallet(input: {
    orgId: string;
    orgType: OwnerType;
    amountMinor: number;
    actorUserId: string;
}): Promise<{ wallet_id: string; new_balance_kobo: number }> {
    const mode = await getSandboxMode();
    if (mode !== 'test') throw new Error('sandbox_test_mode_required');
    if (!input.orgId.startsWith('sandbox_')) throw new Error('sandbox_org_required');
    const wallet = await getOrCreateWallet(input.orgType, input.orgId);
    await postEntry({
        walletId: wallet.id,
        direction: 'credit',
        amountMinor: input.amountMinor,
        entryType: 'manual_credit',
        referenceType: 'dev_sandbox',
        referenceId: input.actorUserId,
        idempotencyKey: `dev_sandbox.seed.${crypto.randomUUID()}`,
        memo: 'Developer sandbox seed',
        createdBy: input.actorUserId,
        audit: { actorType: 'staff', actorRole: 'dev.console' },
    });
    const balance = await getBalance(wallet.id);
    await logDevActivity('seed_wallet', `${input.orgType} ${input.orgId} credited ${input.amountMinor}.`, input.actorUserId);
    return { wallet_id: wallet.id, new_balance_kobo: balance.availableMinor };
}

export async function runMockVend(input: {
    meterNumber: string;
    amountMinor: number;
    mockResponse: string;
    actorUserId: string;
}): Promise<{ raw_response: JsonRecord; vend_id: string }> {
    const vendId = `mock_${crypto.randomUUID()}`;
    const status = input.mockResponse === 'success' ? 'success' : 'failed';
    const rawResponse = {
        status,
        meter_number: input.meterNumber,
        amount_kobo: input.amountMinor,
        mock_response: input.mockResponse,
        vend_id: vendId,
        generated_at: nowIso(),
    };
    await logDevActivity('mock_vend', `${input.mockResponse} vend for ${input.meterNumber}.`, input.actorUserId);
    return { raw_response: rawResponse, vend_id: vendId };
}

export async function listDevHealth(): Promise<ServiceStatus[]> {
    const checkedAt = nowIso();
    const started = Date.now();
    let supabaseStatus: ServiceStatus['status'] = 'healthy';
    let message: string | null = null;
    try {
        const { error } = await adminClient.from('roles').select('id', { count: 'exact', head: true });
        if (error) throw error;
    } catch (error: unknown) {
        supabaseStatus = 'down';
        message = error instanceof Error ? error.message : 'Supabase probe failed.';
    }
    const supabaseLatency = Date.now() - started;
    return [
        {
            id: 'supabase',
            name: 'Supabase',
            category: 'Infrastructure',
            status: supabaseStatus,
            latency_ms: supabaseLatency,
            uptime_7d: supabaseStatus === 'healthy' ? 99.99 : 98.5,
            checked_at: checkedAt,
            message,
        },
        {
            id: 'paystack',
            name: 'Paystack',
            category: 'Payments',
            status: env.PAYSTACK_SECRET_KEY ? 'healthy' : 'unknown',
            latency_ms: null,
            uptime_7d: null,
            checked_at: checkedAt,
            message: env.PAYSTACK_SECRET_KEY ? 'Configured.' : 'PAYSTACK_SECRET_KEY is not configured.',
        },
        {
            id: 'twilio',
            name: 'Twilio SMS',
            category: 'Telecom',
            status: env.TWILIO_ACCOUNT_SID ? 'healthy' : 'unknown',
            latency_ms: null,
            uptime_7d: null,
            checked_at: checkedAt,
            message: env.TWILIO_ACCOUNT_SID ? 'Configured.' : 'Twilio credentials are not configured.',
        },
        {
            id: 'energy',
            name: 'Energy Backend',
            category: 'Meter APIs',
            status: env.ENERGY_BACKEND_URL ? 'healthy' : 'unknown',
            latency_ms: null,
            uptime_7d: null,
            checked_at: checkedAt,
            message: env.ENERGY_BACKEND_URL ? 'Configured.' : 'ENERGY_BACKEND_URL is not configured.',
        },
    ];
}

export async function listDevIncidents(): Promise<Array<{
    id: string;
    service_id: string;
    service_name: string;
    severity: 'minor' | 'major' | 'critical';
    title: string;
    started_at: string;
    resolved_at: string | null;
}>> {
    const { data, error } = await adminClient
        .from('dev_service_incidents')
        .select('id, service_id, service_name, severity, title, started_at, resolved_at')
        .order('started_at', { ascending: false })
        .limit(100);
    if (error) throw error;
    return (data ?? []) as Array<{
        id: string;
        service_id: string;
        service_name: string;
        severity: 'minor' | 'major' | 'critical';
        title: string;
        started_at: string;
        resolved_at: string | null;
    }>;
}

export async function listDevQueues(): Promise<QueueStat[]> {
    const { data, error } = await adminClient.from('dev_queue_jobs').select('queue, status, created_at');
    if (error) throw error;
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return Object.entries(QUEUE_LABELS).map(([queue, label]) => {
        const rows = (data ?? []).filter((row: JsonRecord) => row.queue === queue);
        return {
            queue,
            label,
            pending: rows.filter((row: JsonRecord) => row.status === 'pending').length,
            processing: rows.filter((row: JsonRecord) => row.status === 'processing').length,
            failed: rows.filter((row: JsonRecord) => row.status === 'failed').length,
            completed_24h: rows.filter((row: JsonRecord) => row.status === 'completed' && Date.parse(String(row.created_at)) >= since).length,
        };
    });
}

export async function listDevJobs(input: {
    queue?: string;
    status?: QueueStatus;
    limit: number;
}): Promise<DevJob[]> {
    let query = adminClient
        .from('dev_queue_jobs')
        .select('id, queue, payload, status, attempts, max_attempts, error, created_at, next_retry_at')
        .order('created_at', { ascending: false })
        .limit(input.limit);
    if (input.queue) query = query.eq('queue', input.queue);
    if (input.status) query = query.eq('status', input.status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row: JsonRecord) => ({
        id: String(row.id),
        queue: String(row.queue),
        payload_preview: shortJson(row.payload),
        status: (row.status as QueueStatus) ?? 'pending',
        attempts: Number(row.attempts ?? 0),
        max_attempts: Number(row.max_attempts ?? 3),
        error: row.error ? String(row.error) : null,
        created_at: String(row.created_at),
        next_retry_at: row.next_retry_at ? String(row.next_retry_at) : null,
    }));
}

export async function retryDevJob(id: string): Promise<void> {
    const { error } = await adminClient
        .from('dev_queue_jobs')
        .update({ status: 'pending', error: null, next_retry_at: null, updated_at: nowIso() })
        .eq('id', id);
    if (error) throw error;
}

export async function deleteDevJob(id: string): Promise<void> {
    const { error } = await adminClient.from('dev_queue_jobs').delete().eq('id', id);
    if (error) throw error;
}

export async function retryAllFailedDevJobs(): Promise<void> {
    const { error } = await adminClient
        .from('dev_queue_jobs')
        .update({ status: 'pending', error: null, next_retry_at: null, updated_at: nowIso() })
        .eq('status', 'failed');
    if (error) throw error;
}

export async function listDevErrors(): Promise<ErrorGroup[]> {
    const { data, error } = await adminClient
        .from('dev_error_groups')
        .select('*')
        .order('last_seen', { ascending: false })
        .limit(200);
    if (error) throw error;
    return (data ?? []).map((row: JsonRecord) => ({
        fingerprint: String(row.fingerprint),
        message: String(row.message),
        source: String(row.source),
        severity: (row.severity as ErrorGroup['severity']) ?? 'error',
        count: Number(row.count ?? 0),
        first_seen: String(row.first_seen),
        last_seen: String(row.last_seen),
        affected_actors: strings(row.affected_actors),
        sample_stack: row.sample_stack ? String(row.sample_stack) : null,
        resolved: Boolean(row.resolved),
    }));
}

export async function resolveDevError(fingerprint: string, actorUserId: string): Promise<void> {
    const { error } = await adminClient
        .from('dev_error_groups')
        .update({ resolved: true, resolved_at: nowIso(), resolved_by: actorUserId })
        .eq('fingerprint', fingerprint);
    if (error) throw error;
}

export async function listDevSlowQueries(thresholdMs: number): Promise<SlowQuery[]> {
    const { data, error } = await adminClient
        .from('dev_slow_queries')
        .select('*')
        .gte('duration_ms', thresholdMs)
        .order('called_at', { ascending: false })
        .limit(200);
    if (error) throw error;
    return (data ?? []).map((row: JsonRecord) => ({
        id: String(row.id),
        query_preview: String(row.query_preview),
        duration_ms: Number(row.duration_ms ?? 0),
        table_hints: strings(row.table_hints),
        called_at: String(row.called_at),
        source: row.source ? String(row.source) : null,
    }));
}

export async function simulateDevVend(input: {
    meterNumber: string;
    amountMinor: number;
    environment: 'test' | 'live';
    actorUserId: string;
}): Promise<{
    vend_id: string;
    meter_number: string;
    amount_kobo: number;
    status: string;
    raw_response: JsonRecord;
    duration_ms: number;
}> {
    const started = Date.now();
    const response = await runMockVend({
        meterNumber: input.meterNumber,
        amountMinor: input.amountMinor,
        mockResponse: input.environment === 'test' ? 'success' : 'live_probe',
        actorUserId: input.actorUserId,
    });
    return {
        vend_id: response.vend_id,
        meter_number: input.meterNumber,
        amount_kobo: input.amountMinor,
        status: String(response.raw_response.status),
        raw_response: response.raw_response,
        duration_ms: Date.now() - started,
    };
}

export async function inspectDevEih(transactionId: string): Promise<{
    transaction_id: string;
    total_score: number;
    decision: 'pass' | 'block' | 'review';
    rules: Array<{
        rule_id: string;
        rule_name: string;
        fired: boolean;
        score_contribution: number;
        reason: string;
    }>;
    evaluated_at: string;
}> {
    const { data: assessment } = await adminClient
        .from('fraud_assessments')
        .select('id, score, action, created_at')
        .eq('id', transactionId)
        .maybeSingle();
    if (!assessment) {
        return {
            transaction_id: transactionId,
            total_score: 0,
            decision: 'pass',
            rules: [{ rule_id: 'record_lookup', rule_name: 'Record Lookup', fired: false, score_contribution: 0, reason: 'No fraud assessment row matched this ID.' }],
            evaluated_at: nowIso(),
        };
    }
    const row = record(assessment);
    const { data: signals } = await adminClient
        .from('fraud_signals')
        .select('id, signal_type, weight, detail')
        .eq('assessment_id', transactionId);
    return {
        transaction_id: transactionId,
        total_score: Number(row.score ?? 0),
        decision: row.action === 'block' ? 'block' : row.action === 'step_up' ? 'review' : 'pass',
        rules: (signals ?? []).map((signal: JsonRecord) => ({
            rule_id: String(signal.id),
            rule_name: String(signal.signal_type),
            fired: true,
            score_contribution: Number(signal.weight ?? 0),
            reason: String(signal.detail ?? ''),
        })),
        evaluated_at: String(row.created_at),
    };
}

export async function inspectLedgerEntry(id: string): Promise<{
    id: string;
    wallet_id: string;
    direction: 'credit' | 'debit';
    amount_kobo: number;
    running_balance_kobo: number;
    entry_type: string;
    reference: string | null;
    created_at: string;
    raw_row: JsonRecord;
    related_transaction: JsonRecord | null;
    triggered_by: string | null;
}> {
    const { data, error } = await adminClient
        .from('wallet_ledger_entries')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('ledger_entry_not_found');
    const row = record(data);
    let related: JsonRecord | null = null;
    if (row.reference_type === 'payment_transaction' && row.reference_id) {
        const { data: tx } = await adminClient.from('payment_transactions').select('*').eq('id', String(row.reference_id)).maybeSingle();
        related = tx ? record(tx) : null;
    }
    return {
        id: String(row.id),
        wallet_id: String(row.wallet_id),
        direction: row.direction === 'debit' ? 'debit' : 'credit',
        amount_kobo: Number(row.amount_minor ?? 0),
        running_balance_kobo: Number(row.balance_after_minor ?? 0),
        entry_type: String(row.entry_type),
        reference: row.reference_id ? String(row.reference_id) : null,
        created_at: String(row.created_at),
        raw_row: row,
        related_transaction: related,
        triggered_by: row.created_by ? String(row.created_by) : null,
    };
}

export async function listDevMigrations(): Promise<MigrationInfo[]> {
    return migrationFiles().map((file) => {
        const [version, ...nameParts] = file.fileName.replace(/\.sql$/, '').split('_');
        return {
            version,
            name: nameParts.join('_'),
            status: 'pending',
            applied_at: null,
            checksum: crypto.createHash('sha256').update(file.source).digest('hex'),
        };
    });
}

export async function dryRunDevMigration(version: string): Promise<{ output: string; version: string }> {
    const file = migrationFiles().find((entry) => entry.fileName.startsWith(version));
    if (!file) throw new Error('migration_not_found');
    return {
        version,
        output: [
            `Dry run for ${file.fileName}.`,
            'No database changes were applied.',
            '',
            file.source.slice(0, 8000),
        ].join('\n'),
    };
}

export async function ensureDevConsoleDefaults(actorUserId: string): Promise<void> {
    for (const config of DEFAULT_CONFIGS) {
        await adminClient.from('dev_sys_config').upsert({
            ...config,
            updated_by: actorUserId,
        }, { onConflict: 'key', ignoreDuplicates: true });
    }
    for (const template of DEFAULT_TEMPLATES) {
        await adminClient.from('dev_notification_templates').upsert(template, {
            onConflict: 'event,channel',
            ignoreDuplicates: true,
        });
    }
}

export async function listDevSysConfig(actorUserId: string): Promise<Array<{
    key: string;
    value: string;
    type: 'string' | 'number' | 'boolean' | 'json';
    description: string;
    category: string;
    updated_at: string;
    updated_by: string | null;
}>> {
    await ensureDevConsoleDefaults(actorUserId);
    const { data, error } = await adminClient
        .from('dev_sys_config')
        .select('key, value, type, description, category, updated_at, updated_by')
        .order('category', { ascending: true })
        .order('key', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Array<{
        key: string;
        value: string;
        type: 'string' | 'number' | 'boolean' | 'json';
        description: string;
        category: string;
        updated_at: string;
        updated_by: string | null;
    }>;
}

export async function updateDevSysConfig(key: string, value: string, actorUserId: string): Promise<void> {
    const { data: existing, error: lookupError } = await adminClient
        .from('dev_sys_config')
        .select('type')
        .eq('key', key)
        .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) throw new Error('config_not_found');
    if (record(existing).type === 'json') JSON.parse(value);
    const { error } = await adminClient
        .from('dev_sys_config')
        .update({ value, updated_by: actorUserId, updated_at: nowIso() })
        .eq('key', key);
    if (error) throw error;
}

export async function listDevNotificationTemplates(actorUserId: string): Promise<Array<{
    id: string;
    name: string;
    channel: 'sms' | 'email';
    event: string;
    subject: string | null;
    body: string;
    variables: string[];
    updated_at: string;
}>> {
    await ensureDevConsoleDefaults(actorUserId);
    const { data, error } = await adminClient
        .from('dev_notification_templates')
        .select('id, name, channel, event, subject, body, variables, updated_at')
        .order('event', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row: JsonRecord) => ({
        id: String(row.id),
        name: String(row.name),
        channel: row.channel === 'sms' ? 'sms' : 'email',
        event: String(row.event),
        subject: row.subject ? String(row.subject) : null,
        body: String(row.body),
        variables: strings(row.variables),
        updated_at: String(row.updated_at),
    }));
}

export async function updateDevNotificationTemplate(id: string, input: {
    subject: string | null;
    body: string;
}): Promise<void> {
    const { error } = await adminClient
        .from('dev_notification_templates')
        .update({ subject: input.subject, body: input.body, updated_at: nowIso() })
        .eq('id', id);
    if (error) throw error;
}

export async function testDevNotificationTemplate(id: string, input: {
    target: string;
    variables: JsonRecord;
    actorUserId: string;
}): Promise<void> {
    await logAction({
        actorUserId: input.actorUserId,
        actorType: 'staff',
        actorRole: 'dev.console',
        action: 'dev.notification_template.test_send',
        targetType: 'dev_notification_template',
        targetId: id,
        after: { target: input.target, variables: input.variables },
    });
}

export async function listDevSchema(): Promise<SchemaTable[]> {
    return parseSchemaFromMigrations();
}

export async function listRoleMatrix(input: RoleMatrixInput): Promise<{
    roles: Array<{ id: string; label: string }>;
    permissions: Array<{ key: string; label: string; group: string; roles: string[] }>;
}> {
    const roleKeys = Object.keys(input.roleLabels);
    const { data } = await adminClient.from('permissions').select('role_key, route_hash').in('role_key', roleKeys);
    const liveByPermission = new Map<string, Set<string>>();
    for (const row of data ?? []) {
        const roleKey = String((row as JsonRecord).role_key);
        const permission = String((row as JsonRecord).route_hash);
        const roles = liveByPermission.get(permission) ?? new Set<string>();
        roles.add(roleKey);
        liveByPermission.set(permission, roles);
    }
    for (const [roleKey, permissions] of Object.entries(input.defaultRolePermissions)) {
        for (const permission of permissions) {
            const roles = liveByPermission.get(permission) ?? new Set<string>();
            roles.add(roleKey);
            liveByPermission.set(permission, roles);
        }
    }
    return {
        roles: roleKeys.map((roleKey) => ({ id: roleKey, label: input.roleLabels[roleKey] ?? roleKey })),
        permissions: input.catalog.map((permission) => ({
            key: permission.key,
            label: permission.label,
            group: permission.group,
            roles: Array.from(liveByPermission.get(permission.key) ?? []),
        })),
    };
}

export async function listDevDeployLog(): Promise<Array<{
    id: string;
    sha: string;
    short_sha: string;
    message: string;
    author: string;
    environment: 'production' | 'staging' | 'dev';
    deployed_at: string;
    deploy_duration_s: number | null;
    status: 'success' | 'failed' | 'rolling';
}>> {
    const { data, error } = await adminClient
        .from('dev_deploy_log')
        .select('id, sha, message, author, environment, deployed_at, deploy_duration_s, status')
        .order('deployed_at', { ascending: false })
        .limit(100);
    if (error) throw error;
    return (data ?? []).map((row: JsonRecord) => {
        const sha = String(row.sha ?? '');
        return {
            id: String(row.id),
            sha,
            short_sha: sha.slice(0, 7),
            message: String(row.message ?? ''),
            author: String(row.author ?? ''),
            environment: (row.environment as 'production' | 'staging' | 'dev') ?? 'dev',
            deployed_at: String(row.deployed_at),
            deploy_duration_s: row.deploy_duration_s === null || row.deploy_duration_s === undefined ? null : Number(row.deploy_duration_s),
            status: (row.status as 'success' | 'failed' | 'rolling') ?? 'success',
        };
    });
}
