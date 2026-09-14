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
