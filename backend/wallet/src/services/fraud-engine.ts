/**
 * Transaction Fraud Engine — Phase 5
 *
 * Scores every purchase attempt in real-time using weighted signals.
 * Score 0–100:
 *   < 70  → allow
 *   70–89 → step_up  (customer must re-verify OTP before purchase completes)
 *   ≥ 90  → block
 *
 * Signals and weights (master design §16.1):
 *   new_device      :  10
 *   new_ip          :   5
 *   new_geo         :  15   (not implemented v1 — requires GeoIP DB)
 *   velocity_5hr    :  20   (≥5 purchases in last hour)
 *   amount_anomaly  :  15   (>3σ above customer baseline)
 *   card_bin_risk   :  10   (direct_pay mode only — not yet wired v1)
 *   meter_mismatch  :  25   (meter_id not in customer's linked meters)
 *
 * Max attainable in v1: 75 (velocity + amount_anomaly + meter_mismatch + new_ip + new_device)
 */
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';

export type FraudAction = 'allow' | 'step_up' | 'block';

export interface FraudSignalResult {
    type: string;
    weight: number;
    detail: string;
}

export interface FraudAssessmentResult {
    score: number;
    action: FraudAction;
    signals: FraudSignalResult[];
    assessmentId: string;
}

export interface AssessInput {
    customerId: string;
    meterId: string;
    amountMinor: number;
    clientIp: string | null;
    userAgent: string | null;
}

function ipHash(ip: string): string {
    return crypto.createHash('sha256').update(ip + 'beverly-ip-salt').digest('hex');
}

function uaHash(ua: string): string {
    return crypto.createHash('sha256').update(ua + 'beverly-ua-salt').digest('hex');
}

function actionFromScore(score: number): FraudAction {
    if (score >= 90) return 'block';
    if (score >= 70) return 'step_up';
    return 'allow';
}

export async function assessPurchase(input: AssessInput): Promise<FraudAssessmentResult> {
    const { customerId, meterId, amountMinor, clientIp, userAgent } = input;
    const signals: FraudSignalResult[] = [];

    await Promise.all([
        checkVelocity(customerId, signals),
        checkAmountAnomaly(customerId, amountMinor, signals),
        checkMeterOwnership(customerId, meterId, signals),
        checkNewIp(customerId, clientIp, signals),
        checkNewDevice(customerId, userAgent, signals),
    ]);

    const score = Math.min(100, signals.reduce((s, sig) => s + sig.weight, 0));
    const action = actionFromScore(score);

    const { data: assessment } = await adminClient
        .from('fraud_assessments')
        .insert({
            customer_id:  customerId,
            meter_id:     meterId,
            amount_minor: amountMinor,
            score,
            action,
            client_ip:    clientIp  ? ipHash(clientIp)          : null,
            user_agent:   userAgent ? userAgent.slice(0, 512)    : null,
        })
        .select('id')
        .single();

    const assessmentId = (assessment as any)?.id ?? '';

    if (assessmentId && signals.length > 0) {
        await adminClient.from('fraud_signals').insert(
            signals.map((s) => ({
                assessment_id: assessmentId,
                signal_type:   s.type,
                weight:        s.weight,
                detail:        s.detail,
            })),
        );
    }

    // Record IP and UA as known so they stop firing next time
    // Record IP and UA as known — fire-and-forget; never block the response
    if (clientIp && assessmentId) {
        void adminClient.from('customer_known_ips').upsert(
            { customer_id: customerId, ip_hash: ipHash(clientIp), last_seen_at: new Date().toISOString() },
            { onConflict: 'customer_id,ip_hash', ignoreDuplicates: false },
        );
    }
    if (userAgent && assessmentId) {
        void adminClient.from('customer_known_devices').upsert(
            { customer_id: customerId, ua_hash: uaHash(userAgent), last_seen_at: new Date().toISOString() },
            { onConflict: 'customer_id,ua_hash', ignoreDuplicates: false },
        );
    }

    return { score, action, signals, assessmentId };
}

export async function linkAssessmentToPurchase(assessmentId: string, purchaseOrderId: string): Promise<void> {
    if (!assessmentId) return;
    await adminClient
        .from('fraud_assessments')
        .update({ purchase_order_id: purchaseOrderId })
        .eq('id', assessmentId);
}

export async function resolveAssessment(
    assessmentId: string,
    resolvedByUserId: string,
    note?: string,
): Promise<void> {
    await adminClient.from('fraud_assessments').update({
        resolved:              true,
        resolved_by_user_id:   resolvedByUserId,
        resolved_at:           new Date().toISOString(),
        resolution_note:       note ?? null,
    }).eq('id', assessmentId);
}

export async function refreshCustomerBaseline(customerId: string): Promise<void> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await adminClient
        .from('purchase_orders')
        .select('amount_minor')
        .eq('customer_id', customerId)
        .eq('status', 'delivered')
        .gte('created_at', since);

    const amounts = (data ?? []).map((r: any) => Number(r.amount_minor));
    if (amounts.length === 0) return;

    const avg    = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((a, b) => a + (b - avg) ** 2, 0) / amounts.length;
    const stddev = Math.sqrt(variance);

    await adminClient.from('customer_risk_baselines').upsert({
        customer_id:          customerId,
        purchase_count:       amounts.length,
        avg_amount_minor:     Math.round(avg),
        stddev_amount_minor:  Math.round(stddev),
        last_computed_at:     new Date().toISOString(),
    });
}

// ── Signal checkers ───────────────────────────────────────────────────────────

async function checkVelocity(customerId: string, signals: FraudSignalResult[]): Promise<void> {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await adminClient
        .from('purchase_orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customerId)
        .gte('created_at', since);

    if ((count ?? 0) >= 5) {
        signals.push({
            type:   'velocity_5hr',
            weight: 20,
            detail: `${count} purchases in the last hour (≥5 threshold)`,
        });
    }
}

async function checkAmountAnomaly(
    customerId: string,
    amountMinor: number,
    signals: FraudSignalResult[],
): Promise<void> {
    const { data: baseline } = await adminClient
        .from('customer_risk_baselines')
        .select('avg_amount_minor, stddev_amount_minor, purchase_count')
        .eq('customer_id', customerId)
        .single();

    if (!baseline
        || (baseline as any).purchase_count < 5
        || (baseline as any).stddev_amount_minor === 0) {
        return; // not enough history — never penalise new customers
    }

    const avg   = (baseline as any).avg_amount_minor as number;
    const std   = (baseline as any).stddev_amount_minor as number;
    const sigma = (amountMinor - avg) / std;

    if (sigma > 3) {
        signals.push({
            type:   'amount_anomaly',
            weight: 15,
            detail: `Purchase amount is ${sigma.toFixed(1)}σ above this customer's baseline`,
        });
    }
}

async function checkMeterOwnership(
    customerId: string,
    meterId: string,
    signals: FraudSignalResult[],
): Promise<void> {
    const { data } = await adminClient
        .from('customer_meters')
        .select('id')
        .eq('customer_id', customerId)
        .eq('meter_id', meterId.toUpperCase())
        .single();

    if (!data) {
        signals.push({
            type:   'meter_mismatch',
            weight: 25,
            detail: `Meter ${meterId} is not linked to this customer account`,
        });
    }
}

async function checkNewIp(
    customerId: string,
    clientIp: string | null,
    signals: FraudSignalResult[],
): Promise<void> {
    if (!clientIp) return;
    const { data } = await adminClient
        .from('customer_known_ips')
        .select('id')
        .eq('customer_id', customerId)
        .eq('ip_hash', ipHash(clientIp))
        .single();

    if (!data) {
        signals.push({ type: 'new_ip', weight: 5, detail: 'Purchase from a previously unseen IP address' });
    }
}

async function checkNewDevice(
    customerId: string,
    userAgent: string | null,
    signals: FraudSignalResult[],
): Promise<void> {
    if (!userAgent) return;
    const { data } = await adminClient
        .from('customer_known_devices')
        .select('id')
        .eq('customer_id', customerId)
        .eq('ua_hash', uaHash(userAgent))
        .single();

    if (!data) {
        signals.push({ type: 'new_device', weight: 10, detail: 'Purchase from a previously unseen device' });
    }
}
