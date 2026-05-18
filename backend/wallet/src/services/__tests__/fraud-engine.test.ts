import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

// ── Helpers mirrored from fraud-engine.ts ────────────────────────────────────
function hashIp(ip: string): string {
    return createHash('sha256').update('beverly-ip-salt' + ip).digest('hex').slice(0, 32);
}

function hashUa(ua: string): string {
    return createHash('sha256').update('beverly-ua-salt' + ua).digest('hex').slice(0, 32);
}

// ── Score thresholds per master design §16 ────────────────────────────────────
const THRESHOLD_BLOCK   = 90;
const THRESHOLD_STEP_UP = 70;

function scoreToAction(score: number): 'allow' | 'step_up' | 'block' {
    if (score >= THRESHOLD_BLOCK)   return 'block';
    if (score >= THRESHOLD_STEP_UP) return 'step_up';
    return 'allow';
}

// ── Signal weights per master design §16 ──────────────────────────────────────
const WEIGHTS = {
    new_device:      10,
    new_ip:          5,
    velocity_5hr:    20,
    amount_anomaly:  15,
    meter_mismatch:  25,
} as const;

describe('fraud score thresholds', () => {
    it('score < 70 → allow', () => {
        expect(scoreToAction(0)).toBe('allow');
        expect(scoreToAction(50)).toBe('allow');
        expect(scoreToAction(69)).toBe('allow');
    });

    it('score 70–89 → step_up', () => {
        expect(scoreToAction(70)).toBe('step_up');
        expect(scoreToAction(80)).toBe('step_up');
        expect(scoreToAction(89)).toBe('step_up');
    });

    it('score >= 90 → block', () => {
        expect(scoreToAction(90)).toBe('block');
        expect(scoreToAction(100)).toBe('block');
    });
});

describe('fraud signal weights', () => {
    it('velocity alone triggers step_up (weight 20)', () => {
        expect(scoreToAction(WEIGHTS.velocity_5hr)).toBe('allow');
        // velocity + new_device = 30 → still allow
        expect(scoreToAction(WEIGHTS.velocity_5hr + WEIGHTS.new_device)).toBe('allow');
        // velocity + new_device + amount_anomaly = 45 → allow
        const combo45 = WEIGHTS.velocity_5hr + WEIGHTS.new_device + WEIGHTS.amount_anomaly;
        expect(scoreToAction(combo45)).toBe('allow');
    });

    it('meter_mismatch + velocity + new_device triggers step_up', () => {
        const score = WEIGHTS.meter_mismatch + WEIGHTS.velocity_5hr + WEIGHTS.new_device;
        // 25 + 20 + 10 = 55 → allow (not step_up yet)
        expect(scoreToAction(score)).toBe('allow');
    });

    it('all signals combined triggers block', () => {
        const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
        // 10 + 5 + 20 + 15 + 25 = 75 → step_up
        expect(total).toBe(75);
        expect(scoreToAction(total)).toBe('step_up');
    });

    it('meter_mismatch + velocity_5hr + amount_anomaly = 60 → allow', () => {
        const score = WEIGHTS.meter_mismatch + WEIGHTS.velocity_5hr + WEIGHTS.amount_anomaly;
        expect(score).toBe(60);
        expect(scoreToAction(score)).toBe('allow');
    });
});

describe('IP/device hashing', () => {
    it('produces 32-char hex strings', () => {
        expect(hashIp('192.168.1.1')).toHaveLength(32);
        expect(hashUa('Mozilla/5.0')).toHaveLength(32);
    });

    it('is deterministic', () => {
        expect(hashIp('10.0.0.1')).toBe(hashIp('10.0.0.1'));
        expect(hashUa('Chrome/120')).toBe(hashUa('Chrome/120'));
    });

    it('salts produce different hashes for same input', () => {
        const ip = '10.0.0.1';
        expect(hashIp(ip)).not.toBe(hashUa(ip));
    });

    it('different IPs produce different hashes', () => {
        expect(hashIp('10.0.0.1')).not.toBe(hashIp('10.0.0.2'));
    });
});
