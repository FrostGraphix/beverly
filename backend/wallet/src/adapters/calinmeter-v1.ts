/** Observed Calinmeter remote-send fields. Other OEMs must not reuse them. */
export interface CalinmeterRemoteTokenInput {
    customerId: string;
    customerName?: string | null;
    meterId: string;
    stationId: string;
    protocolVersion?: string | null;
    token: string;
    reference: string;
}

/** Observed Calinmeter credit-token inputs. */
export interface CalinmeterCreditTokenInput {
    customerId: string;
    customerName?: string | null;
    meterId: string;
    tariffId: string;
    amountMinor: number;
    units: number;
    isThreePhase?: boolean | null;
    reference: string;
    vendorName?: string | null;
    operatorName?: string | null;
    authorizationPassword: string;
}

/** Calinmeter credit-token wire request. */
export interface CalinmeterCreditTokenPayload {
    customerId: string;
    meterId: string;
    tariffId: string;
    authorizationPassword: string;
    remark: string;
    isPreview: boolean;
    isVendByTotalPaid: true;
    amount: number;
    totalUnit: number;
    payDebtPercent: 0;
    paymentMethod: 'Cash';
    isS2: boolean;
    operatorName: string;
    userName: string;
    vendorName: string;
    operator: string;
}

/** Inputs needed for legacy Calinmeter response fallbacks. */
export interface CalinmeterCreditTokenFallback {
    reference: string;
    amountMinor: number;
    units: number;
    generatedAtFallback: string;
}

/** Normalized result returned to the existing wallet flow. */
export interface CalinmeterCreditTokenResult {
    token: string;
    tokenRecordId: string;
    amountMinor: number;
    units: number;
    generatedAt: string;
    upstreamPayload: Record<string, unknown>;
}

/** Existing wallet fields normalized from Calinmeter account records. */
export interface CalinmeterMeterInfo {
    meterId: string;
    customerId: string;
    customerName: string;
    stationId: string;
    tariffId: string;
    protocolVersion: string | null;
    communicationWay: string | null;
    isThreePhase: boolean | null;
    sgc: string | null;
}

/** Existing wallet-facing remote task result. */
export interface CalinmeterRemoteTaskResult {
    taskId: string;
    status: 'pending' | 'success' | 'failed' | 'unknown';
    remark: string | null;
}

/** Preserve Calinmeter's legacy static bearer authentication. */
export function buildCalinmeterBearerHeader(token: string | null | undefined): { name: 'Authorization'; value: string } | null {
    const value = String(token ?? '').trim();
    return value ? { name: 'Authorization', value: `Bearer ${value}` } : null;
}

/** Existing wallet-facing station ownership fields. */
export interface CalinmeterStationOwner {
    oemId: string | null;
    oemSlug: string | null;
    oemName: string | null;
}

/** Existing wallet-facing normalized station. */
export interface CalinmeterStationInfo extends CalinmeterStationOwner {
    stationId: string;
    name: string;
    remark: string | null;
    status: 'active' | 'disabled';
}

/** Preserve the legacy station envelope and status aliases. */
export function normalizeCalinmeterStations(payload: unknown, owner: CalinmeterStationOwner): CalinmeterStationInfo[] {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
    const result = (payload as Record<string, unknown>).result;
    if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
    const data = (result as Record<string, unknown>).data;
    if (!Array.isArray(data)) return [];
    return data
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
        .filter((row) => String(row.stationId ?? '').trim() !== '')
        .filter((row) => String(row.stationId).toUpperCase() !== 'ADMIN')
        .map((row) => {
            const stationId = String(row.stationId);
            const disabled = row.status === false
                || row.status === 0
                || /^(disabled|inactive|offline|deleted)$/i.test(String(row.status ?? ''));
            return {
                stationId,
                name: row.name == null ? stationId : String(row.name),
                remark: row.remark == null ? null : String(row.remark),
                ...owner,
                status: disabled ? 'disabled' as const : 'active' as const,
            };
        })
        .sort((left, right) => left.name.localeCompare(right.name));
}

/** Preserve Calinmeter GetTokenTask pagination. */
export function buildCalinmeterTaskLookupPayload(meterId: string) {
    return {
        lang: 'en',
        meterId,
        pageNumber: 1,
        pageSize: 10,
        orderBy: 'createDate desc',
    };
}

/** Collect positive Calinmeter task identifiers. */
export function collectCalinmeterTaskIds(value: unknown, target: number[] = []): number[] {
    if (!value) return target;
    if (Array.isArray(value)) {
        for (const item of value) collectCalinmeterTaskIds(item, target);
        return target;
    }
    if (typeof value !== 'object') return target;
    const record = value as Record<string, unknown>;
    const id = Number(record.id ?? record.taskId ?? record.taskID ?? record.recordId);
    if (Number.isFinite(id) && id > 0) target.push(id);
    collectCalinmeterTaskIds(record.result, target);
    collectCalinmeterTaskIds(record.data, target);
    return target;
}

/** Preserve Calinmeter UpdateTokenTask payloads. */
export function buildCalinmeterTaskConfirmPayload(response: unknown): Array<{ id: number }> {
    return [...new Set(collectCalinmeterTaskIds(response))].map((id) => ({ id }));
}

/** Collect Calinmeter task rows across known envelopes. */
export function collectCalinmeterTaskRows(value: unknown, target: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
    if (!value) return target;
    if (Array.isArray(value)) {
        for (const item of value) collectCalinmeterTaskRows(item, target);
        return target;
    }
    if (typeof value !== 'object') return target;
    const record = value as Record<string, unknown>;
    if (record.id || record.taskId || record.recordId) target.push(record);
    collectCalinmeterTaskRows(record.result, target);
    collectCalinmeterTaskRows(record.data, target);
    return target;
}

/** Confirm only the exact meter/token standby task. */
export function buildCalinmeterStandbyConfirmPayload(response: unknown, meterId: string, rawToken: string): Array<{ id: number }> {
    const token = String(rawToken || '').replace(/\s+/g, '');
    const ids = collectCalinmeterTaskRows(response)
        .filter((row) => String(row.meterId || '').trim() === String(meterId || '').trim())
        .filter((row) => String(row.data || row.token || '').replace(/\s+/g, '') === token)
        .filter((row) => row.status === 0 || row.status === '0' || String(row.status || '').toLowerCase() === 'standby')
        .map((row) => Number(row.id ?? row.taskId ?? row.recordId))
        .filter((id) => Number.isFinite(id) && id > 0);
    return [...new Set(ids)].map((id) => ({ id }));
}

/** Preserve Calinmeter task status codes and aliases. */
export function normalizeCalinmeterTaskStatus(status: unknown): CalinmeterRemoteTaskResult['status'] {
    const value = String(status ?? '').trim().toLowerCase();
    if (['1', 'success', 'successful', 'done', 'completed'].includes(value)) return 'success';
    if (['2', 'failed', 'failure', 'error'].includes(value)) return 'failed';
    if (['0', '3', 'pending', 'processing', 'standby', 'queued'].includes(value)) return 'pending';
    return 'unknown';
}

/** Preserve the wallet's current Calinmeter remote remarks. */
export function normalizeCalinmeterRemoteRemark(rawRemark: unknown): string {
    const text = String(rawRemark ?? '').trim();
    const lower = text.toLowerCase();

    if (!text) return 'Remote send completed.';
    if (lower.includes('token used') || lower.includes('used token') || lower.includes('token already used') || lower.includes('old token') || lower.includes('duplicate token')) {
        return 'Token has already been used or entered into the meter.';
    }
    if (lower.includes('already sent') || lower.includes('already exists') || lower.includes('task exists') || lower.includes('no data has been changed')) {
        return 'Token was already sent over the air to this meter.';
    }
    if (lower.includes('keypad') || lower.includes('manual entry')) {
        return 'Token was entered manually via meter keypad.';
    }
    if (lower.includes('offline') || lower.includes('unreachable') || lower.includes('timeout')) {
        return 'Meter is currently offline or unconfirmed over the air. Token remains valid for manual keypad entry.';
    }
    return text;
}

/** Normalize one Calinmeter GetTokenTask row. */
export function parseCalinmeterTaskRow(row: Record<string, unknown>, fallbackTaskId: string): CalinmeterRemoteTaskResult {
    const rawRemark = row.remark == null ? null : String(row.remark);
    return {
        taskId: String(row.id ?? row.taskId ?? row.recordId ?? fallbackTaskId),
        status: normalizeCalinmeterTaskStatus(row.status),
        remark: rawRemark ? normalizeCalinmeterRemoteRemark(rawRemark) : null,
    };
}

/** Preserve observed Calinmeter collection envelopes. */
export function getCalinmeterAccountRows(payload: unknown): Array<Record<string, unknown>> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
    const source = payload as Record<string, unknown>;
    if (Array.isArray(source.records)) return source.records;
    if (Array.isArray(source.rows)) return source.rows;
    if (Array.isArray(source.data)) return source.data;
    if (source.data && typeof source.data === 'object' && !Array.isArray(source.data)) {
        const data = source.data as Record<string, unknown>;
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.records)) return data.records;
        if (Array.isArray(data.list)) return data.list;
    }
    if (Array.isArray(source.result)) return source.result;
    if (source.result && typeof source.result === 'object' && !Array.isArray(source.result)) {
        const result = source.result as Record<string, unknown>;
        if (Array.isArray(result.data)) return result.data;
        if (Array.isArray(result.records)) return result.records;
        if (Array.isArray(result.list)) return result.list;
    }
    return [];
}

/** Preserve the wallet's existing Calinmeter boolean aliases. */
export function normalizeCalinmeterBoolean(value: unknown): boolean | null {
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['true', 'yes', 'y'].includes(normalized)) return true;
    if (['false', 'no', 'n'].includes(normalized)) return false;
    return null;
}

/** Preserve account-row aliases and legacy wallet fallbacks. */
export function normalizeCalinmeterMeterRow(row: Record<string, unknown>, requestedMeterId: string): CalinmeterMeterInfo {
    const meter = String(row.meterId || row.meter_id || requestedMeterId).trim();
    const customerId = String(row.customerId || row.customer_id || row.id || meter).trim();
    const station = String(row.stationId || row.station_id || row.SITE_ID || row.customerAddress || row.customer_address || '').trim();
    return {
        meterId: meter,
        customerId,
        customerName: String(row.customerName || row.customer_name || row.name || `Customer ${meter}`).trim(),
        stationId: station || 'UNKNOWN',
        tariffId: String(row.tariffId || row.tariff_id || '').trim() || 'RESIDENTIAL',
        protocolVersion: String(row.protocolVersion || row.protocol_version || '').trim() || null,
        communicationWay: String(row.communicationWay || row.communication_way || '').trim() || null,
        isThreePhase: normalizeCalinmeterBoolean(row.isThreePhase ?? row.is_three_phase ?? row.threePhase),
        sgc: String(row.sgc ?? row.SGC ?? '').trim() || null,
    };
}

/** Find one exact external meter in a Calinmeter account response. */
export function findCalinmeterMeter(payload: unknown, meterId: string): CalinmeterMeterInfo | null {
    const row = getCalinmeterAccountRows(payload)
        .find((item) => String(item.meterId || item.meter_id || '').trim() === meterId);
    return row ? normalizeCalinmeterMeterRow(row, meterId) : null;
}

/** Preserve Calinmeter's observed result/data response aliases. */
export function parseCalinmeterCreditTokenResponse(
    response: unknown,
    fallback: CalinmeterCreditTokenFallback,
): CalinmeterCreditTokenResult | null {
    if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
    const envelope = response as Record<string, unknown>;
    const raw = envelope.result || envelope.data || envelope;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const data = raw as Record<string, unknown>;
    const token = String(data.token || data.tokenFirst || '').trim();
    if (!token) return null;
    return {
        token,
        tokenRecordId: String(data.tokenRecordId || data.receiptId || data.id || fallback.reference),
        amountMinor: Math.round(Number(data.amount ?? data.totalPaid ?? fallback.amountMinor / 100) * 100),
        units: Number(data.units ?? data.totalUnit ?? fallback.units),
        generatedAt: String(data.createdAt || data.createTime || data.createDate || fallback.generatedAtFallback),
        upstreamPayload: data,
    };
}

/** Preserve the existing Calinmeter credit-token request. */
export function buildCalinmeterCreditTokenPayload(
    input: CalinmeterCreditTokenInput,
    opts: { isPreview?: boolean; isS2?: boolean } = {},
): CalinmeterCreditTokenPayload {
    const amount = Math.round((input.amountMinor / 100) * 100) / 100;
    const operatorName = input.operatorName || input.vendorName || input.customerName || 'Beverly';
    return {
        customerId: input.customerId,
        meterId: input.meterId,
        tariffId: input.tariffId,
        authorizationPassword: input.authorizationPassword,
        remark: `Beverly vend ${input.reference}`,
        isPreview: opts.isPreview ?? false,
        isVendByTotalPaid: true,
        amount,
        totalUnit: input.units,
        payDebtPercent: 0,
        paymentMethod: 'Cash',
        isS2: typeof opts.isS2 === 'boolean' ? opts.isS2 : input.isThreePhase === true,
        operatorName,
        userName: operatorName,
        vendorName: operatorName,
        operator: operatorName,
    };
}

/** Calinmeter CreateTokenTask wire record. */
export interface CalinmeterTokenTaskPayload {
    customerId: string;
    customerName: string;
    meterId: string;
    version: string;
    flag: 'A120';
    name: 'Send Token';
    dataItem: 'Send Token';
    dataDefault: '';
    dataPrefix: '';
    data: string;
    stationId: string;
    remark: string;
}

/** Preserve the existing Calinmeter CreateTokenTask request. */
export function buildCalinmeterRemoteTokenPayload(input: CalinmeterRemoteTokenInput): CalinmeterTokenTaskPayload[] {
    const token = String(input.token || '').replace(/\s+/g, '');
    return [{
        customerId: input.customerId || input.meterId,
        customerName: input.customerName ?? '',
        meterId: input.meterId,
        version: input.protocolVersion || '2.2',
        flag: 'A120',
        name: 'Send Token',
        dataItem: 'Send Token',
        dataDefault: '',
        dataPrefix: '',
        data: token,
        stationId: input.stationId,
        remark: `Beverly remote token ${input.reference}`,
    }];
}
