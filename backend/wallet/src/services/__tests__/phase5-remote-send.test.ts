/**
 * Phase 5 regression — Bug H6: Remote Send Flow.
 *
 * Covers:
 *   • vending.ts: token stored BEFORE createRemoteSendTask network call
 *   • vending.ts: resendRemoteSendOrder export (no token re-generation)
 *   • admin.ts:   POST /purchases/:id/resend-remote route + permission entry
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd(), '../..');

// ── vending.ts — remote send flow ─────────────────────────────────────────────
describe('vending service — remote send flow (Bug H6)', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/vending.ts'), 'utf-8');

    it('stores token to DB before calling createRemoteSendTask', () => {
        // The intermediate update with token must appear before createRemoteSendTask call
        const tokenUpdateIdx     = src.indexOf("delivery_state: 'token_generated_remote_send_queued'");
        const createTaskIdx      = src.indexOf('createRemoteSendTask(');
        expect(tokenUpdateIdx).toBeGreaterThan(0);
        expect(createTaskIdx).toBeGreaterThan(0);
        expect(tokenUpdateIdx).toBeLessThan(createTaskIdx);
    });

    it('intermediate update stores the token field', () => {
        const queuedIdx = src.indexOf("delivery_state: 'token_generated_remote_send_queued'");
        const block     = src.slice(queuedIdx - 300, queuedIdx + 50);
        expect(block).toContain('token,');
    });

    it('second update after createRemoteSendTask stores remote_task_id', () => {
        const taskIdx   = src.indexOf('createRemoteSendTask(');
        const block     = src.slice(taskIdx, taskIdx + 600);
        expect(block).toContain('remote_task_id: remoteTaskId');
        expect(block).toContain("delivery_state: 'remote_send_pending'");
    });

    it('exports resendRemoteSendOrder function', () => {
        expect(src).toContain('export async function resendRemoteSendOrder');
    });

    it('resendRemoteSendOrder validates delivery_pending_review status', () => {
        const start = src.indexOf('export async function resendRemoteSendOrder');
        const block = src.slice(start, start + 800);
        expect(block).toContain('delivery_pending_review');
        expect(block).toContain('invalid_state');
    });

    it('resendRemoteSendOrder checks for stored token before resending', () => {
        const start = src.indexOf('export async function resendRemoteSendOrder');
        const block = src.slice(start, start + 800);
        expect(block).toContain('no_token');
        expect(block).toContain("!(row as any).token");
    });

    it('resendRemoteSendOrder calls createRemoteSendTask with stored token', () => {
        const start = src.indexOf('export async function resendRemoteSendOrder');
        const block = src.slice(start, start + 1800);
        expect(block).toContain('createRemoteSendTask(');
        expect(block).toContain('po.token!');
    });

    it('resendRemoteSendOrder never calls generateCreditToken', () => {
        const start = src.indexOf('export async function resendRemoteSendOrder');
        const end   = src.indexOf('\nexport ', start + 1);
        const fnBody = src.slice(start, end > start ? end : start + 1800);
        expect(fnBody).not.toContain('generateCreditToken');
    });

    it('resendRemoteSendOrder updates status back to dispatching', () => {
        const start = src.indexOf('export async function resendRemoteSendOrder');
        const block = src.slice(start, start + 1800);
        expect(block).toContain("'dispatching'");
        expect(block).toContain("'remote_send_pending'");
    });

    it('resendRemoteSendOrder clears failure_reason on resend', () => {
        const start = src.indexOf('export async function resendRemoteSendOrder');
        const block = src.slice(start, start + 1800);
        expect(block).toContain('failure_reason');
        expect(block).toContain('null');
    });

    it('resendRemoteSendOrder logs the action', () => {
        const start = src.indexOf('export async function resendRemoteSendOrder');
        const block = src.slice(start, start + 1800);
        expect(block).toContain('logAction(');
        expect(block).toContain("'vending.remote_send.resend'");
    });
});

// ── admin.ts — resend-remote route ────────────────────────────────────────────
describe('admin routes — POST /purchases/:id/resend-remote', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/routes/admin.ts'), 'utf-8');

    it('has permission entry for resend-remote', () => {
        expect(src).toContain("'POST /purchases/:id/resend-remote'");
        expect(src).toContain("'wallet.vending.monitor'");
    });

    it('has route handler for POST /purchases/:id/resend-remote', () => {
        expect(src).toContain("fastify.post('/purchases/:id/resend-remote'");
    });

    it('route calls resendRemoteSendOrder', () => {
        const start = src.indexOf("fastify.post('/purchases/:id/resend-remote'");
        const block = src.slice(start, start + 500);
        expect(block).toContain('resendRemoteSendOrder');
    });

    it('route returns taskId on success', () => {
        const start = src.indexOf("fastify.post('/purchases/:id/resend-remote'");
        const block = src.slice(start, start + 500);
        expect(block).toContain('taskId');
        expect(block).toContain('ok: true');
    });

    it('route returns 404 for not_found', () => {
        const start = src.indexOf("fastify.post('/purchases/:id/resend-remote'");
        const block = src.slice(start, start + 700);
        expect(block).toContain('404');
        expect(block).toContain("'not_found'");
    });

    it('route returns 409 for invalid_state', () => {
        const start = src.indexOf("fastify.post('/purchases/:id/resend-remote'");
        const block = src.slice(start, start + 700);
        expect(block).toContain('409');
        expect(block).toContain("'invalid_state'");
    });

    it('route returns 422 for no_token', () => {
        const start = src.indexOf("fastify.post('/purchases/:id/resend-remote'");
        const block = src.slice(start, start + 700);
        expect(block).toContain('422');
        expect(block).toContain("'no_token'");
    });

    it('route uses actor userId for audit log', () => {
        const start = src.indexOf("fastify.post('/purchases/:id/resend-remote'");
        const block = src.slice(start, start + 500);
        expect(block).toContain('req.actor!.userId');
    });
});
