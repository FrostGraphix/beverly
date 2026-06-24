import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { initTheme } from '@beverly/tokens';

import '@beverly/tokens/tokens.css';
import '@beverly/tokens/theme.css';
import '@beverly/tokens/wallet.css';
import './styles/app.css';

initTheme('dark');

function initQualitySettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('beverly.admin.qualitySettings') || '{}');
        document.documentElement.dataset.adminDensity = saved.density === 'compact' ? 'compact' : 'comfortable';
        document.documentElement.dataset.adminReduceMotion = saved.reduceMotion ? 'true' : 'false';
        document.documentElement.dataset.adminStickyTables = saved.stickyTables === false ? 'false' : 'true';
        document.documentElement.dataset.adminAutoRefresh = saved.autoRefresh === false ? 'false' : 'true';
    } catch {
        document.documentElement.dataset.adminDensity = 'comfortable';
        document.documentElement.dataset.adminReduceMotion = 'false';
        document.documentElement.dataset.adminStickyTables = 'true';
        document.documentElement.dataset.adminAutoRefresh = 'true';
    }
}

initQualitySettings();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
