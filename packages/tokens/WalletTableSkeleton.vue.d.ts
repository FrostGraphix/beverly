import type { DefineComponent } from 'vue';

declare const component: DefineComponent<{
  columns?: number;
  rows?: number;
  variant?: 'rows' | 'cards';
}>;

export default component;
