import { createApp } from 'vue';
import type { Directive } from 'vue';
import App from './App.vue';
import { initTheme } from '@beverly/tokens';

import '@beverly/tokens/tokens.css';
import '@beverly/tokens/theme.css';
import '@beverly/tokens/wallet.css';
import './styles/landing.css';

initTheme('dark');

/** v-reveal — fade/slide elements in as they enter the viewport. */
const reveal: Directive<HTMLElement, number | undefined> = {
    mounted(el, binding) {
        const delay = Number(binding.value ?? 0);
        el.style.setProperty('--reveal-delay', `${delay}ms`);
        el.classList.add('lp-reveal');

        if (typeof IntersectionObserver === 'undefined') {
            el.classList.add('lp-reveal--in');
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        el.classList.add('lp-reveal--in');
                        io.unobserve(el);
                    }
                }
            },
            { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
        );
        io.observe(el);
    },
};

const app = createApp(App);
app.directive('reveal', reveal);
app.mount('#app');
