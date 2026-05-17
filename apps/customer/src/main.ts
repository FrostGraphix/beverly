import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { initTheme } from '@beverly/tokens';

import '@beverly/tokens/wallet.css';
import './styles/app.css';

initTheme('dark');

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
