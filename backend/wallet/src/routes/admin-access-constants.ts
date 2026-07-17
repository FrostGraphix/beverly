// Shared admin access-control catalog. Single source for permission keys,
// role defaults, and role labels used by the admin routes and dev console.
export const PERMISSION_CATALOG = [
    { key: 'wallet.dashboard.view', label: 'View operations dashboard', group: 'Overview', risk: 'low' },
    { key: 'wallet.vendors.review', label: 'Review vendor applications', group: 'Vendors', risk: 'medium' },
    { key: 'wallet.vendors.manage', label: 'Create and manage vendors', group: 'Vendors', risk: 'high' },
    { key: 'wallet.customers.view', label: 'View customer accounts', group: 'Customers', risk: 'high' },
    { key: 'wallet.funding.view', label: 'View funding queue', group: 'Money', risk: 'medium' },
    { key: 'wallet.funding.approve', label: 'Approve vendor funding', group: 'Money', risk: 'critical' },
    { key: 'wallet.vending.monitor', label: 'Monitor vending activity', group: 'Money', risk: 'medium' },
    { key: 'wallet.refunds.manage', label: 'Approve refunds', group: 'Operations', risk: 'critical' },
    { key: 'wallet.disputes.manage', label: 'Resolve disputes', group: 'Operations', risk: 'medium' },
    { key: 'wallet.support.manage', label: 'Manage support (FAQ, tickets, chat)', group: 'Operations', risk: 'medium' },
    { key: 'wallet.announcements.manage', label: 'Send wallet announcements', group: 'Operations', risk: 'high' },
    { key: 'wallet.settlement.view', label: 'View settlement batches', group: 'Operations', risk: 'medium' },
    { key: 'wallet.reconciliation.run', label: 'Run reconciliation', group: 'Operations', risk: 'high' },
    { key: 'wallet.fraud.review', label: 'Resolve fraud reviews', group: 'Compliance', risk: 'high' },
    { key: 'wallet.privacy.review', label: 'Review privacy requests', group: 'Compliance', risk: 'high' },
    { key: 'wallet.audit.view', label: 'View audit and security events', group: 'Compliance', risk: 'high' },
    { key: 'wallet.flags.manage', label: 'Manage feature flags', group: 'Launch', risk: 'critical' },
    { key: 'wallet.vat.manage', label: 'Govern VAT policies', group: 'Money', risk: 'critical' },
    { key: 'wallet.access.manage', label: 'Manage roles and permissions', group: 'Access', risk: 'critical' },
    { key: 'dev.console', label: 'Access developer console', group: 'Developer', risk: 'critical' },
    { key: 'wallet.consumption.view', label: 'View consumption analytics', group: 'Analytics', risk: 'low' },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    'super-admin': PERMISSION_CATALOG.map((p) => p.key),
    'operations-manager': [
        'wallet.dashboard.view', 'wallet.vendors.review', 'wallet.vending.monitor',
        'wallet.customers.view', 'wallet.disputes.manage', 'wallet.support.manage', 'wallet.announcements.manage', 'wallet.settlement.view', 'wallet.reconciliation.run',
        'wallet.fraud.review', 'wallet.audit.view', 'wallet.consumption.view',
    ],
    // Every staff role may view consumption. What they actually see is bounded
    // by their station assignment (staffStations → stationsAuthority), so an
    // assigned staffer sees only their station and an unassigned one sees
    // nothing. Super-admin is the only role with estate-wide visibility.
    'finance-checker': [
        'wallet.dashboard.view', 'wallet.funding.view', 'wallet.funding.approve',
        'wallet.refunds.manage', 'wallet.settlement.view', 'wallet.reconciliation.run',
        'wallet.audit.view', 'wallet.vat.manage', 'wallet.consumption.view',
    ],
    account: [
        'wallet.dashboard.view', 'wallet.funding.view', 'wallet.customers.view', 'wallet.vending.monitor',
        'wallet.settlement.view', 'wallet.reconciliation.run', 'wallet.consumption.view',
    ],
};

export const ROLE_LABELS: Record<string, string> = {
    'super-admin': 'Super Admin',
    'operations-manager': 'Operations Manager',
    'finance-checker': 'Finance Checker',
    account: 'Account Officer',
};

export const ROLE_LEGACY_NAMES: Record<string, string> = {
    'super-admin': 'admin',
    'operations-manager': 'ops',
    'finance-checker': 'analyst',
    account: 'finance',
};

export const SYSTEM_ROLE_KEYS = new Set(Object.keys(DEFAULT_ROLE_PERMISSIONS));
