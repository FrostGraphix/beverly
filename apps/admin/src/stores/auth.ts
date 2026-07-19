import { defineStore } from 'pinia';
import { ApiError, api } from '../lib/api';

export interface StaffProfile {
    id: string;
    email: string | null;
    full_name: string | null;
    role: string;
    profile_picture_url: string | null;
    updated_at?: string | null;
}

interface State {
    hydrated: boolean;
    accessToken: string | null;
    user: StaffProfile | null;
    permissions: string[];
    lastValidatedAt: number | null;
}

function isSessionTerminalError(error: unknown): boolean {
    return error instanceof ApiError && error.status === 401;
}

export const useStaffAuthStore = defineStore('staff-auth', {
    state: (): State => ({ hydrated: false, accessToken: null, user: null, permissions: [], lastValidatedAt: null }),
    getters: {
        isAuthenticated: (s) => !!s.accessToken && !!s.user,
        hasPermission: (s) => (permission: string) => s.user?.role === 'super-admin' || s.permissions.includes(permission),
    },
    actions: {
        async hydrate(force = false) {
            if (this.hydrated && !force) return;
            this.hydrated = true;
            let token: string | null = null;
            let userJson: string | null = null;
            try {
                token = localStorage.getItem('beverly.staff.access_token');
                userJson = localStorage.getItem('beverly.staff.user');
            } catch {
                this.logout();
                return;
            }
            if (token && userJson) {
                this.accessToken = token;
                try {
                    this.user = JSON.parse(userJson);
                    const cachedPerms = localStorage.getItem('beverly.staff.permissions');
                    this.permissions = cachedPerms ? JSON.parse(cachedPerms) : [];
                } catch {
                    this.logout();
                }
                try {
                    await this.refreshSession();
                } catch (error) {
                    if (!isSessionTerminalError(error)) return;
                    this.logout();
                }
            }
        },
        async refreshSession() {
            if (!this.accessToken) return;
            const fresh = await api.get<{ user: StaffProfile; permissions: string[] }>('/api/v1/admin/me');
            this.user = fresh.user;
            this.permissions = fresh.permissions;
            this.lastValidatedAt = Date.now();
            localStorage.setItem('beverly.staff.user', JSON.stringify(fresh.user));
            localStorage.setItem('beverly.staff.permissions', JSON.stringify(fresh.permissions));
        },
        async ensureFreshSession(maxAgeMs = 60_000) {
            if (!this.accessToken) return;
            if (this.lastValidatedAt && Date.now() - this.lastValidatedAt < maxAgeMs) return;
            try {
                await this.refreshSession();
            } catch (error) {
                if (isSessionTerminalError(error)) {
                    this.logout();
                    throw error;
                }
            }
        },
        setSession(token: string, user: StaffProfile, permissions: string[] = []) {
            this.accessToken = token;
            this.user = user;
            this.permissions = permissions;
            this.lastValidatedAt = Date.now();
            localStorage.setItem('beverly.staff.access_token', token);
            localStorage.setItem('beverly.staff.user', JSON.stringify(user));
            localStorage.setItem('beverly.staff.permissions', JSON.stringify(permissions));
        },
        logout() {
            if (this.accessToken) void api.post('/api/v1/admin/logout', {}).catch(() => undefined);
            this.accessToken = null;
            this.user = null;
            this.permissions = [];
            this.lastValidatedAt = null;
            localStorage.removeItem('beverly.staff.access_token');
            localStorage.removeItem('beverly.staff.user');
            localStorage.removeItem('beverly.staff.permissions');
        },
    },
});
