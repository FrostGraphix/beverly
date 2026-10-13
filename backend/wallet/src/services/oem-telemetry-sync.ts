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
    fetchPage(input: SparkMeterTelemetryTarget & { dateFrom: string; dateTo: string; cursor?: string }): Promise<TelemetryPage>;
    persistPage(installationId: string, mode: 'historical', scopeKey: string, page: TelemetryPage): Promise<{ readings: number; quarantine: number }>;
    wait?: (milliseconds: number) => Promise<void>;
}
export interface TelemetryReplayOptions { readonly date?: string; readonly site?: string }
export interface TelemetrySyncSummary {
    installations: number;
    pages: number;
    readings: number;
    quarantine: number;
    failures: { installationId: string; reason: string }[];
}

const dependencies: SyncDependencies = {
    fetchPage: (input) => fetchSparkMeterTelemetryPage({ ...input, mode: 'historical' }),
    persistPage: (installationId, mode, scopeKey, page) => persistTelemetryPage(installationId, mode, scopeKey, page),
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

/** Synchronize one UTC date; authenticated operators can replay recent dates. */
export async function runSparkMeterTelemetrySync(
    targets: readonly SparkMeterTelemetryTarget[],
    deps: SyncDependencies = dependencies,
    options: TelemetryReplayOptions = {},
): Promise<TelemetrySyncSummary> {
    const today = new Date().toISOString().slice(0, 10);
    const date = options.date ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (!z.string().date().safeParse(date).success
        || date < new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
        || date > today) throw new Error('OEM telemetry date outside replay window');
    if (options.site && !z.string().uuid().safeParse(options.site).success) throw new Error('OEM telemetry site outside installation');
    const site = options.site;
    const selected = site ? targets.filter((target) => target.sites.includes(site)) : targets;
    if (options.site && selected.length === 0) throw new Error('OEM telemetry site outside installation');
    const summary: TelemetrySyncSummary = { installations: selected.length, pages: 0, readings: 0, quarantine: 0, failures: [] };
    for (const target of selected) {
        const seen = new Set<string>();
        let cursor: string | undefined;
        try {
            const sites = options.site ? [options.site] : target.sites;
            if (sites.length === 0 || sites.length > 90) {
                throw new Error('telemetry_site_day_budget_exceeded');
            }
            const scopeKey = `${date}:${date}:${sites.join(',')}`;
            for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
                const page = await deps.fetchPage({ ...target, sites, dateFrom: date, dateTo: date, cursor });
                const stored = await deps.persistPage(target.installationId, 'historical', scopeKey, page);
                summary.pages += 1;
                summary.readings += stored.readings;
                summary.quarantine += stored.quarantine;
                if (!page.hasMore) break;
                if (!page.nextCursor || seen.has(page.nextCursor)) throw new Error('telemetry_cursor_repeated');
                seen.add(page.nextCursor);
                cursor = page.nextCursor;
                if (pageNumber === 19) throw new Error('telemetry_page_budget_exhausted');
                await deps.wait?.(1700);
            }
        } catch (error) {
            const reason = error instanceof Error && /^telemetry_/.test(error.message) ? error.message : 'telemetry_sync_failed';
            summary.failures.push({ installationId: target.installationId, reason });
        }
    }
    if (summary.failures.length) {
        throw Object.assign(new Error('OEM telemetry synchronization failed'), { failures: summary.failures });
    }
    return summary;
}

const installationRows = z.array(z.object({
    id: z.string().uuid(), base_url: z.string().url(), approved_hostnames: z.array(z.string()).min(1),
    config_version: z.number().int().positive(), tenants: z.object({ status: z.literal('active') }),
    oem_manufacturers: z.object({ slug: z.literal('sparkmeter') }),
    oem_config_revisions: z.array(z.object({ revision: z.number().int().positive(), configuration: z.record(z.unknown()) })),
})).max(100);

/** Discover active SparkMeter installations and synchronize historical telemetry. */
export async function syncActiveSparkMeterTelemetry(options: TelemetryReplayOptions = {}): Promise<TelemetrySyncSummary> {
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
        if (!organizationId.success) throw new Error('OEM telemetry target configuration invalid');
        const siteIds = new Set<string>();
        for (let page = 0; page <= 10; page += 1) {
            const meters = await adminClient.from('oem_inventory_meters').select('site_id')
                .eq('oem_installation_id', row.id).eq('status', 'active')
                .order('id', { ascending: true }).range(page * 1000, page * 1000 + 999);
            if (meters.error || !meters.data || (page === 10 && meters.data.length > 0)) {
                throw new Error('OEM telemetry sites unavailable');
            }
            for (const meter of meters.data) {
                if (!meter.site_id) throw new Error('OEM telemetry sites unavailable');
                siteIds.add(meter.site_id);
            }
            if (meters.data.length < 1000) break;
        }
        const sites = [...siteIds];
        if (sites.length === 0 || sites.length > 90) throw new Error('OEM telemetry sites unavailable');
        if (options.site && !sites.includes(options.site)) continue;
        const credentials = await loadInstallationCredentials({ id: row.id, tenantId: '', status: 'active' });
        if (credentials.authStrategy !== 'api_key_pair') throw new Error('OEM telemetry credentials invalid');
        targets.push({
            installationId: row.id, baseUrl: row.base_url, approvedHostnames: row.approved_hostnames,
            organizationId: organizationId.data, apiKey: credentials.apiKey, apiSecret: credentials.apiSecret, sites,
        });
    }
    return runSparkMeterTelemetrySync(targets, dependencies, options);
}
