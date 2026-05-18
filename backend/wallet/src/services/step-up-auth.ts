/**
 * Step-up authentication service — Phase 5
 *
 * When fraud score is 70–89, the purchase is not completed.
 * Instead, the backend:
 *   1. Creates a step_up_challenges row with a 6-digit OTP + 10-min expiry.
 *   2. Sends OTP via SMS to the customer's registered phone.
 *   3. Returns { challenge_id, expires_at } to the client.
 *
 * Customer enters the OTP. Client calls POST /purchase/step-up-verify
 * with challenge_id + otp + original purchase params.
 * Backend verifies challenge, then runs the purchase (skipping fraud check).
 */
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { sendSms } from '../adapters/twilio.js';

const OTP_TTL_MS = 10 * 60 * 1000;  // 10 minutes
const MAX_ATTEMPTS = 5;

export class StepUpError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'StepUpError';
    }
}

function generateOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp + 'beverly-stepup-salt').digest('hex');
}

export interface StepUpChallenge {
    challengeId: string;
    expiresAt: string;
}

export async function issueStepUpChallenge(customerId: string): Promise<StepUpChallenge> {
    // Get customer phone for SMS delivery
    const { data: customer } = await adminClient
        .from('customers')
        .select('users(phone)')
        .eq('id', customerId)
        .single();

    const phone = (customer as any)?.users?.phone as string | null;
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    const { data: challenge, error } = await adminClient
        .from('step_up_challenges')
        .insert({
            customer_id: customerId,
            otp_hash:    hashOtp(otp),
            expires_at:  expiresAt,
        })
        .select('id')
        .single();

    if (error || !challenge) {
        throw new StepUpError('Could not create security challenge', 'challenge_create_failed');
    }

    // Best-effort SMS — don't block purchase flow if Twilio is down
    if (phone) {
        sendSms({ to: phone, body: `Beverly security check: your one-time code is ${otp}. Valid for 10 minutes. Do not share this code.` })
            .catch(() => void 0);
    }

    return { challengeId: (challenge as any).id, expiresAt };
}

export async function verifyStepUpChallenge(challengeId: string, otp: string): Promise<void> {
    const { data: challenge } = await adminClient
        .from('step_up_challenges')
        .select('*')
        .eq('id', challengeId)
        .single();

    if (!challenge) {
        throw new StepUpError('Security challenge not found', 'challenge_not_found');
    }
    if ((challenge as any).used) {
        throw new StepUpError('This security code has already been used', 'challenge_used');
    }
    if (new Date((challenge as any).expires_at) < new Date()) {
        throw new StepUpError('Security code has expired. Please start the purchase again.', 'challenge_expired');
    }
    if ((challenge as any).attempts >= MAX_ATTEMPTS) {
        throw new StepUpError('Too many incorrect attempts. Please start the purchase again.', 'too_many_attempts');
    }

    // Increment attempt count before checking (rate-limit first)
    await adminClient
        .from('step_up_challenges')
        .update({ attempts: (challenge as any).attempts + 1 })
        .eq('id', challengeId);

    if (hashOtp(otp) !== (challenge as any).otp_hash) {
        throw new StepUpError('Incorrect security code', 'invalid_otp');
    }

    // Mark as used
    await adminClient
        .from('step_up_challenges')
        .update({ used: true })
        .eq('id', challengeId);
}
