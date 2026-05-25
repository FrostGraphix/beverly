/// <reference types="vite/client" />

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
    export default component;
}

declare module '@beverly/tokens' {
    export function setTheme(name: string): void;
    export function initTheme(defaultName?: string): void;
    export function toggleTheme(): void;
}
