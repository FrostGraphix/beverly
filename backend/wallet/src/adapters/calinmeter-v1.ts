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
