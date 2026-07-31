import { describe, it, expect } from 'vitest';
import {
    CUSTOM_ROLE_PREFIX,
    RESTRICTED_TO_SYSTEM_ROLES,
    buildCustomRoleKey,
    escapeLikePattern,
    isLegacyRoleNameSchemaError,
    isReservedRoleName,
    isUniqueViolation,
    isUsableRoleSlug,
    slugifyRoleName,
    ungrantablePermissions,
} from '../role-identity.js';

describe('slugifyRoleName', () => {
    it('lowercases and hyphenates a normal name', () => {
        expect(slugifyRoleName('Compliance Reviewer')).toBe('compliance-reviewer');
    });

    it('strips leading and trailing separators', () => {
        expect(slugifyRoleName('  --Ops Lead--  ')).toBe('ops-lead');
    });

    it('collapses runs of punctuation into a single hyphen', () => {
        expect(slugifyRoleName('Risk // Fraud')).toBe('risk-fraud');
    });

    it('yields an empty slug for non-latin input', () => {
        expect(slugifyRoleName('Ревизор')).toBe('');
        expect(slugifyRoleName('審査員')).toBe('');
        expect(slugifyRoleName('🔥🔥')).toBe('');
    });
});

describe('buildCustomRoleKey', () => {
    it('always namespaces custom roles', () => {
        expect(buildCustomRoleKey('Compliance Reviewer')).toBe(`${CUSTOM_ROLE_PREFIX}compliance-reviewer`);
    });

    it('maps visually distinct names onto the same key — the caller must 409', () => {
        const keys = ['Ops!', 'ops', '  OPS  ', 'Ops???'].map(buildCustomRoleKey);
        expect(new Set(keys).size).toBe(1);
        expect(keys[0]).toBe(`${CUSTOM_ROLE_PREFIX}ops`);
    });

    it('keeps internal separators distinct — O-P-S is not the same role as Ops', () => {
        expect(buildCustomRoleKey('O-P-S')).toBe(`${CUSTOM_ROLE_PREFIX}o-p-s`);
        expect(buildCustomRoleKey('O-P-S')).not.toBe(buildCustomRoleKey('Ops'));
    });

    it('cannot collide with a system role key', () => {
        expect(buildCustomRoleKey('super admin')).toBe(`${CUSTOM_ROLE_PREFIX}super-admin`);
        expect(buildCustomRoleKey('super admin')).not.toBe('super-admin');
    });
});

describe('isUsableRoleSlug', () => {
    it('rejects slugs shorter than two characters', () => {
        expect(isUsableRoleSlug('')).toBe(false);
        expect(isUsableRoleSlug('a')).toBe(false);
    });

    it('accepts two characters or more', () => {
        expect(isUsableRoleSlug('qa')).toBe(true);
        expect(isUsableRoleSlug('compliance-reviewer')).toBe(true);
    });

    it('rejects every non-latin name via its slug', () => {
        for (const name of ['Ревизор', '審査員', '🔥']) {
            expect(isUsableRoleSlug(slugifyRoleName(name))).toBe(false);
        }
    });
});

describe('isReservedRoleName', () => {
    it('matches system role display names case-insensitively', () => {
        expect(isReservedRoleName('Super Admin')).toBe(true);
        expect(isReservedRoleName('super admin')).toBe(true);
        expect(isReservedRoleName('  SUPER ADMIN  ')).toBe(true);
        expect(isReservedRoleName('Operations Manager')).toBe(true);
        expect(isReservedRoleName('Finance Checker')).toBe(true);
        expect(isReservedRoleName('Account Officer')).toBe(true);
    });

    it('allows names that merely resemble a system role', () => {
        expect(isReservedRoleName('Super Admin Assistant')).toBe(false);
        expect(isReservedRoleName('Compliance Reviewer')).toBe(false);
    });
});

describe('ungrantablePermissions', () => {
    it('blocks dev.console for a custom role', () => {
        expect(ungrantablePermissions(['wallet.dashboard.view', 'dev.console'], false)).toEqual(['dev.console']);
    });

    it('allows dev.console for a system role', () => {
        expect(ungrantablePermissions(['dev.console'], true)).toEqual([]);
    });

    it('passes ordinary permissions through untouched', () => {
        expect(ungrantablePermissions(['wallet.funding.approve', 'wallet.access.manage'], false)).toEqual([]);
    });

    it('keeps the restricted set non-empty (a guard that blocks nothing is a bug)', () => {
        expect(RESTRICTED_TO_SYSTEM_ROLES.size).toBeGreaterThan(0);
        expect(RESTRICTED_TO_SYSTEM_ROLES.has('dev.console')).toBe(true);
    });
});

describe('escapeLikePattern', () => {
    it('escapes the single-character wildcard so an exact ilike stays exact', () => {
        // Unescaped, "Ops_Lead" would also match "OpsXLead" and 409 wrongly.
        expect(escapeLikePattern('Ops_Lead')).toBe('Ops\\_Lead');
    });

    it('escapes the multi-character wildcard', () => {
        expect(escapeLikePattern('50% Reviewer')).toBe('50\\% Reviewer');
    });

    it('escapes backslashes before they can escape something else', () => {
        expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
    });

    it('leaves ordinary names untouched', () => {
        expect(escapeLikePattern('Compliance Reviewer')).toBe('Compliance Reviewer');
    });
});

describe('isUniqueViolation', () => {
    it('recognises the PostgreSQL unique-violation code', () => {
        expect(isUniqueViolation({ code: '23505' })).toBe(true);
    });

    it('ignores other errors and absent errors', () => {
        expect(isUniqueViolation({ code: '23503' })).toBe(false);
        expect(isUniqueViolation(null)).toBe(false);
        expect(isUniqueViolation(undefined)).toBe(false);
    });
});

describe('isLegacyRoleNameSchemaError', () => {
    it('detects an enum rejection from the legacy app_role column', () => {
        expect(isLegacyRoleNameSchemaError({
            code: '22P02',
            message: 'invalid input value for enum app_role: "custom-compliance-reviewer"',
        })).toBe(true);
    });

    it('detects the not-null violation once the column is no longer written', () => {
        expect(isLegacyRoleNameSchemaError({
            code: '23502',
            message: 'null value in column "name" of relation "roles" violates not-null constraint',
        })).toBe(true);
    });

    it('does not swallow an unrelated enum rejection', () => {
        expect(isLegacyRoleNameSchemaError({
            code: '22P02',
            message: 'invalid input value for enum meter_type_enum: "quad_phase"',
        })).toBe(false);
    });

    it('does not swallow a not-null violation on a different column', () => {
        expect(isLegacyRoleNameSchemaError({
            code: '23502',
            message: 'null value in column "label" of relation "roles" violates not-null constraint',
        })).toBe(false);
    });

    it('ignores unrelated and absent errors', () => {
        expect(isLegacyRoleNameSchemaError({ code: '23505', message: 'duplicate key' })).toBe(false);
        expect(isLegacyRoleNameSchemaError(null)).toBe(false);
        expect(isLegacyRoleNameSchemaError(undefined)).toBe(false);
    });
});
