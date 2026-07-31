/**
 * Custom role identity rules — pure helpers shared by the access routes.
 *
 * Role keys are derived from the operator-supplied display name. Two different
 * names can slug to the same key, and a custom role can be named after a system
 * role, so the derivation and the guards around it live here where they can be
 * tested directly.
 */
import { ROLE_LABELS } from '../routes/admin-access-constants.js';

export const CUSTOM_ROLE_PREFIX = 'custom-';

/**
 * Permissions a custom role may never hold. `dev.console` unlocks the developer
 * console (schema browser, system config writes); it stays bound to the system
 * roles that are provisioned deliberately.
 */
export const RESTRICTED_TO_SYSTEM_ROLES = new Set(['dev.console']);

export function slugifyRoleName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function buildCustomRoleKey(name: string): string {
    return `${CUSTOM_ROLE_PREFIX}${slugifyRoleName(name)}`;
}

/** A slug shorter than 2 chars cannot address a role (non-latin input lands here). */
export function isUsableRoleSlug(slug: string): boolean {
    return slug.length >= 2;
}

/** Case-insensitive match against the built-in role display names. */
export function isReservedRoleName(name: string): boolean {
    const candidate = name.trim().toLowerCase();
    return Object.values(ROLE_LABELS).some((label) => label.toLowerCase() === candidate);
}

/** Permissions in `requested` that the target role is not allowed to hold. */
export function ungrantablePermissions(requested: string[], isSystemRole: boolean): string[] {
    if (isSystemRole) return [];
    return requested.filter((permission) => RESTRICTED_TO_SYSTEM_ROLES.has(permission));
}

/**
 * Escape LIKE metacharacters so an exact-match `ilike` stays exact.
 * Without this, a role named "Ops_Lead" matches "OpsXLead" and "50%" matches
 * anything starting with "50" — producing a false "name already taken".
 */
export function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** PostgreSQL unique-violation — a pre-check that lost a race. */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
    return error?.code === '23505';
}

/**
 * The legacy `roles.name` column (enum `app_role`, NOT NULL on legacy CRM
 * databases) cannot hold a custom role. Until
 * 20260728140000_roles_name_nullable.sql is applied, a custom-role insert fails
 * with one of:
 *   22P02 — invalid input value for enum app_role (column still written)
 *   23502 — null value violates not-null constraint (column no longer written)
 * Both mean the same thing operationally: the schema migration is outstanding.
 * Surfacing that beats a generic "could not create role".
 */
export function isLegacyRoleNameSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    if (error.code === '22P02') return /app_role/i.test(String(error.message ?? ''));
    return error.code === '23502' && /\bname\b/i.test(String(error.message ?? ''));
}
