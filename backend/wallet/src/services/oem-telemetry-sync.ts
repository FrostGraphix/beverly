import { z } from 'zod';
import { fetchSparkMeterTelemetryPage } from '../adapters/sparkmeter-koios-v2.js';
import { adminClient } from '../db/supabase.js';
import { loadInstallationCredentials } from './oem-installation-credentials.js';
import { persistTelemetryPage, type TelemetryPage } from './oem-telemetry.js';

export interface SparkMeterTelemetryTarget {
    readonly installationId: string;
    readonly baseUrl: string;
    readonly approvedHostnames: readonly string[];
    readonly organizationId: string;
    readonly apiKey: string;
    readonly apiSecret: string;
    readonly sites: readonly string[];
}
interface SyncDependencies {
    fetchPage(input: SparkMeterTelemetryTarget & { cursor?: string }): Promise<TelemetryPage>;
    persistPage(installationId: string, mode: 'live', scopeKey: string, page: TelemetryPage): Promise<{ readings: number; quarantine: number }>;
}
export interface TelemetrySyncSummary {
    installations: number;
    pages: number;
    readings: number;
    quarantine: number;
    failures: { installationId: string; reason: string }[];
}

const dependencies: SyncDependencies = {
    fetchPage: (input) => fetchSparkMeterTelemetryPage({ ...input, mode: 'live' }),
    persistPage: (installationId, mode, scopeKey, page) => persistTelemetryPage(installationId, mode, scopeKey, page),
};

/** Run bounded sequential reads to respect Koios data rate limits. */
export async function runSparkMeterTelemetrySync(
    targets: readonly SparkMeterTelemetryTarget[],
    deps: SyncDependencies = dependencies,
): Promise<TelemetrySyncSummary> {
    const summary: TelemetrySyncSummary = { installations: targets.length, pages: 0, readings: 0, quarantine: 0, failures: [] };
    for (const target of targets) {
        const seen = new Set<string>();
        let cursor: string | undefined;
        try {
            for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
                const page = await deps.fetchPage({ ...target, cursor });
                const stored = await deps.persistPage(target.installationId, 'live', target.sites.join(','), page);
                summary.pages += 1;
                summary.readings += stored.readings;
                summary.quarantine += stored.quarantine;
                if (!page.hasMore) break;
                if (!page.nextCursor || seen.has(page.nextCursor)) throw new Error('telemetry_cursor_repeated');
                seen.add(page.nextCursor);
                cursor = page.nextCursor;
                if (pageNumber === 19) throw new Error('telemetry_page_budget_exhausted');
            }
        } catch (error) {
            const reason = error instanceof Error && /^telemetry_/.test(error.message) ? error.message : 'telemetry_sync_failed';
            summary.failures.push({ installationId: target.installationId, reason });
        }
    }
    return summary;
}

const installationRows = z.array(z.object({
    id: z.string().uuid(), base_url: z.string().url(), approved_hostnames: z.array(z.string()).min(1),
    config_version: z.number().int().positive(), tenants: z.object({ status: z.literal('active') }),
    oem_manufacturers: z.object({ slug: z.literal('sparkmeter') }),
    oem_config_revisions: z.array(z.object({ revision: z.number().int().positive(), configuration: z.record(z.unknown()) })),
})).max(100);

/** Discover active SparkMeter installations and synchronize their live telemetry. */
export async function syncActiveSparkMeterTelemetry(): Promise<TelemetrySyncSummary> {
    const { data, error } = await adminClient.from('oem_installations')
        .select('id, base_url, approved_hostnames, config_version, tenants!inner(status), oem_manufacturers!inner(slug), oem_config_revisions(revision, configuration)')
        .eq('status', 'active').eq('tenants.status', 'active').eq('oem_manufacturers.slug', 'sparkmeter')
        .limit(101);
    const parsed = installationRows.safeParse(data);
    if (error || !parsed.success) throw new Error('OEM telemetry target discovery failed');
    const targets: SparkMeterTelemetryTarget[] = [];
    for (const row of parsed.data) {
        const revision = row.oem_config_revisions.find((item) => item.revision === row.config_version);
        const organizationId = z.string().uuid().safeParse(revision?.configuration.organization_id);
        if (!organizationId.success) continue;
        // ponytail: 10,000 active meters covers current inventory; paginate when installations exceed this ceiling.
        const meters = await adminClient.from('oem_inventory_meters').select('site_id')
            .eq('oem_installation_id', row.id).eq('status', 'active').not('site_id', 'is', null).limit(10_000);
        const sites = [...new Set((meters.data ?? []).map((meter) => meter.site_id).filter((site): site is string => Boolean(site)))];
        if (meters.error || sites.length === 0 || sites.length > 200) continue;
        const credentials = await loadInstallationCredentials({ id: row.id, tenantId: '', status: 'active' });
        if (credentials.authStrategy !== 'api_key_pair') continue;
        targets.push({
            installationId: row.id, baseUrl: row.base_url, approvedHostnames: row.approved_hostnames,
            organizationId: organizationId.data, apiKey: credentials.apiKey, apiSecret: credentials.apiSecret, sites,
        });
    }
    return runSparkMeterTelemetrySync(targets);
}
