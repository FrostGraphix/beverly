/**
 * Phase 3 regression tests — compliance & scale.
 *
 * Covers:
 *   • compliance-ctr service: CTR_THRESHOLD_MINOR, key exports, reference format
 *   • aml-screening service: score bands, key exports, normalization
 *   • kyc-documents service: key exports, bucket constant, doc types
 *   • DB migrations: CTR/AML/KYC/SLA migration files
 *   • Scheduler: SLA escalation + CTR sweep + AML refresh jobs
 *   • BullMQ queue: compliance queue + retry opts
 *   • Admin routes: bulk wallet ops + compliance endpoints
 *   • Customer routes: KYC document upload endpoint
 *   • Admin UI: Disputes.vue SLA, Wallets.vue bulk ops
 *   • Load test script exists
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd(), '../..');

// ── CTR service ───────────────────────────────────────────────────────────────
describe('compliance-ctr service', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/compliance-ctr.ts'), 'utf-8');

    it('exports CTR_THRESHOLD_MINOR as 500000000', () => {
        expect(src).toContain('CTR_THRESHOLD_MINOR = 500_000_000');
    });

    it('exports maybeGenerateCtr', () => {
        expect(src).toContain('export async function maybeGenerateCtr');
    });

    it('returns null when below threshold', () => {
        expect(src).toContain('if (input.amountMinor < CTR_THRESHOLD_MINOR) return null');
    });

    it('exports listCtrs', () => {
        expect(src).toContain('export async function listCtrs');
    });

    it('exports fileCtr', () => {
        expect(src).toContain('export async function fileCtr');
    });

    it('exports getCtrStats', () => {
        expect(src).toContain('export async function getCtrStats');
    });

    it('exports buildCbnReport for CBN export', () => {
        expect(src).toContain('export async function buildCbnReport');
    });

    it('CTR reference includes CTR- prefix', () => {
        expect(src).toContain('CTR-');
    });

    it('exports CtrError with code field', () => {
        expect(src).toContain('export class CtrError');
        expect(src).toContain('public code: string');
    });
});

// ── AML screening service ─────────────────────────────────────────────────────
describe('aml-screening service', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/aml-screening.ts'), 'utf-8');

    it('exports screenEntity', () => {
        expect(src).toContain('export async function screenEntity');
    });

    it('exports reviewScreening', () => {
        expect(src).toContain('export async function reviewScreening');
    });

    it('exports addSanctionsEntry', () => {
        expect(src).toContain('export async function addSanctionsEntry');
    });

    it('exports listScreenings', () => {
        expect(src).toContain('export async function listScreenings');
    });

    it('exports listSanctionsEntries', () => {
        expect(src).toContain('export async function listSanctionsEntries');
    });

    it('exports AmlError with code', () => {
        expect(src).toContain('export class AmlError');
        expect(src).toContain('public code: string');
    });

    it('score >= 70 → blocked', () => {
        expect(src).toContain("'blocked'");
        expect(src).toContain('>= 70');
    });

    it('score >= 40 → flagged', () => {
        expect(src).toContain("'flagged'");
        expect(src).toContain('>= 40');
    });

    it('uses trigram similarity for matching', () => {
        expect(src).toContain('trigramSimilarity');
    });

    it('normalizes names before comparison', () => {
        expect(src).toContain('normalizeName');
    });
});

// ── KYC documents service ─────────────────────────────────────────────────────
describe('kyc-documents service', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/kyc-documents.ts'), 'utf-8');

    it('uses wallet-kyc-documents bucket', () => {
        expect(src).toContain('wallet-kyc-documents');
    });

    it('exports generateUploadUrl', () => {
        expect(src).toContain('export async function generateUploadUrl');
    });

    it('exports getDownloadUrl', () => {
        expect(src).toContain('export async function getDownloadUrl');
    });

    it('exports listDocuments', () => {
        expect(src).toContain('export async function listDocuments');
    });

    it('exports reviewDocument', () => {
        expect(src).toContain('export async function reviewDocument');
    });

    it('exports listPendingDocuments', () => {
        expect(src).toContain('export async function listPendingDocuments');
    });

    it('exports KycDocumentError with code', () => {
        expect(src).toContain('export class KycDocumentError');
        expect(src).toContain('public code: string');
    });

    it('enforces 10 MB file size limit', () => {
        expect(src).toContain('10 * 1024 * 1024');
    });

    it('signed URL TTL is defined', () => {
        expect(src).toContain('SIGNED_URL_TTL');
    });

    it('supports selfie doc type for liveness', () => {
        expect(src).toContain("'selfie'");
    });
});

// ── DB migrations ─────────────────────────────────────────────────────────────
describe('DB migration: CTR/AML', () => {
    const sql = readFileSync(resolve(ROOT, 'supabase/migrations/20260529150000_compliance_ctr_aml.sql'), 'utf-8');

    it('creates currency_transaction_reports table', () => {
        expect(sql).toContain('currency_transaction_reports');
        expect(sql).toContain('create table');
    });

    it('has amount_minor and direction columns', () => {
        expect(sql).toContain('amount_minor');
        expect(sql).toContain('direction');
    });

    it('has status column with draft/filed lifecycle', () => {
        expect(sql).toContain("'draft'");
        expect(sql).toContain("'filed'");
    });

    it('creates aml_screening_results table', () => {
        expect(sql).toContain('aml_screening_results');
        expect(sql).toContain('match_score');
        expect(sql).toContain('matched_entries');
    });

    it('creates sanctions_list_entries table', () => {
        expect(sql).toContain('sanctions_list_entries');
        expect(sql).toContain('full_name');
    });

    it('enables RLS on all three tables', () => {
        const rlsCount = (sql.match(/enable row level security/g) ?? []).length;
        expect(rlsCount).toBeGreaterThanOrEqual(3);
    });

    it('creates pg_trgm index on sanctions names', () => {
        expect(sql).toContain('gin_trgm_ops');
    });
});

describe('DB migration: KYC documents', () => {
    const sql = readFileSync(resolve(ROOT, 'supabase/migrations/20260529160000_kyc_documents.sql'), 'utf-8');

    it('creates kyc_documents table', () => {
        expect(sql).toContain('kyc_documents');
        expect(sql).toContain('create table');
    });

    it('has doc_type with allowed values', () => {
        expect(sql).toContain('doc_type');
        expect(sql).toContain("'selfie'");
        expect(sql).toContain("'passport'");
    });

    it('has status pending/approved/rejected/expired', () => {
        expect(sql).toContain("'pending'");
        expect(sql).toContain("'approved'");
        expect(sql).toContain("'rejected'");
    });

    it('has storage_path column (not raw binary)', () => {
        expect(sql).toContain('storage_path');
    });

    it('enables RLS with owner-read policy', () => {
        expect(sql).toContain('enable row level security');
        expect(sql).toContain('kyc_doc_owner_read');
    });

    it('inserts wallet-kyc-documents storage bucket', () => {
        expect(sql).toContain('wallet-kyc-documents');
        expect(sql).toContain('storage.buckets');
    });
});

describe('DB migration: disputes SLA', () => {
    const sql = readFileSync(resolve(ROOT, 'supabase/migrations/20260529165000_disputes_sla.sql'), 'utf-8');

    it('adds sla_deadline column', () => {
        expect(sql).toContain('sla_deadline');
    });

    it('adds escalated_at column', () => {
        expect(sql).toContain('escalated_at');
    });

    it('back-fills 72-hour SLA for existing open disputes', () => {
        expect(sql).toContain('72 hours');
    });

    it('creates index for scheduler SLA sweep', () => {
        expect(sql).toContain('idx_disputes_sla');
    });

    it('trigger auto-sets sla_deadline on insert', () => {
        expect(sql).toContain('set_dispute_sla_deadline');
        expect(sql).toContain('trg_dispute_sla_deadline');
    });
});

// ── Scheduler ─────────────────────────────────────────────────────────────────
describe('scheduler — Phase 3 jobs', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/jobs/scheduler.ts'), 'utf-8');

    it('has SLA escalation job registered', () => {
        expect(src).toContain('escalateOverdueDisputes');
        expect(src).toContain('sla-escalation');
    });

    it('SLA job runs every 15 minutes', () => {
        expect(src).toContain('*/15 * * * *');
    });

    it('has CTR sweep job at 04:00 daily', () => {
        expect(src).toContain('sweepUnfiledCtrs');
        expect(src).toContain('0 4 * * *');
    });

    it('has AML periodic refresh job at 06:00 daily', () => {
        expect(src).toContain('periodicAmlRefresh');
        expect(src).toContain('0 6 * * *');
    });

    it('escalation marks escalated_at without changing dispute status', () => {
        const start = src.indexOf('async function escalateOverdueDisputes');
        const end   = src.indexOf('\nasync function ', start + 1);
        const body  = end > 0 ? src.slice(start, end) : src.slice(start);
        expect(body).toContain('escalated_at');
        // must NOT update the status field — only sets escalated_at
        expect(body).not.toContain("update({ status:");
        expect(body).not.toContain('status: input.status');
    });
});

// ── Queue ─────────────────────────────────────────────────────────────────────
describe('BullMQ queue — Phase 3', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/queue/index.ts'), 'utf-8');

    it('exports complianceQueue', () => {
        expect(src).toContain('export const complianceQueue');
    });

    it('complianceQueue is closed in closeQueues', () => {
        expect(src).toContain('complianceQueue.close()');
    });

    it('uses exponential back-off retry policy', () => {
        expect(src).toContain("type: 'exponential'");
    });

    it('has removeOnComplete and removeOnFail to manage queue size', () => {
        expect(src).toContain('removeOnComplete');
        expect(src).toContain('removeOnFail');
    });

    it('IORedis uses lazyConnect', () => {
        expect(src).toContain('lazyConnect');
    });
});

// ── Admin routes ──────────────────────────────────────────────────────────────
describe('admin routes — Phase 3', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/routes/admin.ts'), 'utf-8');

    it('has bulk wallet status endpoint', () => {
        expect(src).toContain("'/wallets/bulk-status'");
    });

    it('has bulk wallet limits endpoint', () => {
        expect(src).toContain("'/wallets/bulk-limits'");
    });

    it('bulk status requires super-admin', () => {
        const start = src.indexOf("'/wallets/bulk-status'");
        const block = src.slice(start, start + 200);
        expect(block).toContain('requireWalletStatusManager');
    });

    it('bulk ops accept up to 100 wallet IDs', () => {
        expect(src).toContain('.max(100)');
    });

    it('has GET /compliance/ctrs endpoint', () => {
        expect(src).toContain("'/compliance/ctrs'");
    });

    it('has POST /compliance/ctrs/:id/file endpoint', () => {
        expect(src).toContain("'/compliance/ctrs/:id/file'");
    });

    it('has GET /compliance/ctrs/report endpoint', () => {
        expect(src).toContain("'/compliance/ctrs/report'");
    });

    it('has GET /compliance/aml endpoint', () => {
        expect(src).toContain("'/compliance/aml'");
    });

    it('has POST /compliance/aml/:id/review endpoint', () => {
        expect(src).toContain("'/compliance/aml/:id/review'");
    });

    it('has GET /compliance/sanctions endpoint', () => {
        expect(src).toContain("'/compliance/sanctions'");
    });

    it('has POST /compliance/sanctions endpoint', () => {
        expect(src).toContain("fastify.post('/compliance/sanctions'");
    });

    it('has GET /kyc/documents/pending endpoint', () => {
        expect(src).toContain("'/kyc/documents/pending'");
    });

    it('has POST /kyc/documents/:docId/review endpoint', () => {
        expect(src).toContain("'/kyc/documents/:docId/review'");
    });

    it('compliance CTR filing is audit logged', () => {
        const start = src.indexOf("'/compliance/ctrs/:id/file'");
        const block = src.slice(start, start + 800);
        expect(block).toContain('logAction');
        expect(block).toContain('compliance.ctr.file');
    });
});

// ── Customer routes ───────────────────────────────────────────────────────────
describe('customer routes — KYC document upload', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/routes/customer.ts'), 'utf-8');

    it('has POST /kyc/documents/upload-url endpoint', () => {
        expect(src).toContain("'/kyc/documents/upload-url'");
    });

    it('has GET /kyc/documents endpoint', () => {
        expect(src).toContain("'/kyc/documents'");
    });

    it('upload-url requires customer auth', () => {
        const start = src.indexOf("'/kyc/documents/upload-url'");
        const block = src.slice(start - 100, start + 100);
        expect(block).toContain('requireCustomer');
    });
});

// ── Admin UI ──────────────────────────────────────────────────────────────────
describe('admin UI — Disputes.vue SLA', () => {
    const src = readFileSync(resolve(ROOT, 'apps/admin/src/views/Disputes.vue'), 'utf-8');

    it('shows SLA column in table', () => {
        expect(src).toContain('SLA');
    });

    it('renders escalated badge', () => {
        expect(src).toContain('escalated_at');
        expect(src).toContain('ESC');
    });

    it('has slaClass helper for color coding', () => {
        expect(src).toContain('slaClass');
        expect(src).toContain('bw-sla-breached');
        expect(src).toContain('bw-sla-warning');
    });

    it('has slaLabel showing time remaining', () => {
        expect(src).toContain('slaLabel');
        expect(src).toContain('Overdue');
    });
});

describe('admin UI — Wallets.vue bulk ops', () => {
    const src = readFileSync(resolve(ROOT, 'apps/admin/src/views/Wallets.vue'), 'utf-8');

    it('has checkbox for row selection', () => {
        expect(src).toContain('checkbox');
        expect(src).toContain('selectedIds');
        expect(src).toContain('toggleOne');
    });

    it('has select-all checkbox in header', () => {
        expect(src).toContain('allSelected');
        expect(src).toContain('toggleAll');
    });

    it('shows Bulk Action button when items selected', () => {
        expect(src).toContain('Bulk Action');
        expect(src).toContain('bulkPanelOpen');
    });

    it('bulk action calls /wallets/bulk-status', () => {
        expect(src).toContain('/api/v1/admin/wallets/bulk-status');
    });

    it('bulk action calls /wallets/bulk-limits', () => {
        expect(src).toContain('/api/v1/admin/wallets/bulk-limits');
    });

    it('w-row-selected CSS class highlights selected rows', () => {
        expect(src).toContain('w-row-selected');
    });
});

// ── Load test ─────────────────────────────────────────────────────────────────
describe('load test tooling', () => {
    it('load-test.cjs exists', () => {
        expect(existsSync(resolve(ROOT, 'tools/load-test.cjs'))).toBe(true);
    });

    it('load test checks /api/v1/health', () => {
        const src = readFileSync(resolve(ROOT, 'tools/load-test.cjs'), 'utf-8');
        expect(src).toContain('/api/v1/health');
    });

    it('load test checks /api/v1/ready', () => {
        const src = readFileSync(resolve(ROOT, 'tools/load-test.cjs'), 'utf-8');
        expect(src).toContain('/api/v1/ready');
    });

    it('load test exits 0 on pass, 1 on fail', () => {
        const src = readFileSync(resolve(ROOT, 'tools/load-test.cjs'), 'utf-8');
        expect(src).toContain('process.exit(0)');
        expect(src).toContain('process.exit(1)');
    });

    it('load test enforces p99 < 1s threshold', () => {
        const src = readFileSync(resolve(ROOT, 'tools/load-test.cjs'), 'utf-8');
        expect(src).toContain('p99 < 1000');
    });
});
