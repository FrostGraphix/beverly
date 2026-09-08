// Compatibility re-export for route modules. Runtime authorization, the Roles
// page, and the Permissions page all resolve this same catalog.
export {
    PERMISSION_CATALOG,
    DEFAULT_ROLE_PERMISSIONS,
    ROLE_LABELS,
    ROLE_LEGACY_NAMES,
    SYSTEM_ROLE_KEYS,
} from '../services/rbac.js';
