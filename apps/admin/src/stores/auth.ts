import { defineStore } from 'pinia';

export interface StaffProfile {
    id: string;
    email: string | null;
    full_name: string | null;
    role: string;
}

interface State {
    hydrated: boolean;
    accessToken: string | null;
    user: StaffProfile | null;
}

export const useStaffAuthStore = defineStore('staff-auth', {
    state: (): State => ({ hydrated: false, accessToken: null, user: null }),
    getters: {
        isAuthenticated: (s) => !!s.accessToken && !!s.user,
    },
    actions: {
        async hydrate() {
            if (this.hydrated) return;
            this.hydrated = true;
            const token = localStorage.getItem('beverly.staff.access_token');
            const userJson = localStorage.getItem('beverly.staff.user');
            if (token && userJson) {
                this.accessToken = token;
                try { this.user = JSON.parse(userJson); } catch { /* noop */ }
            }
        },
        setSession(token: string, user: StaffProfile) {
            this.accessToken = token;
            this.user = user;
            localStorage.setItem('beverly.staff.access_token', token);
            localStorage.setItem('beverly.staff.user', JSON.stringify(user));
        },
        logout() {
            this.accessToken = null;
            this.user = null;
            localStorage.removeItem('beverly.staff.access_token');
            localStorage.removeItem('beverly.staff.user');
        },
    },
});
