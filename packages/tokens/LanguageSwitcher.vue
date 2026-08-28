<script setup>
import { useI18n } from './i18n.js';

defineProps({ compact: { type: Boolean, default: false } });
const emit = defineEmits(['change']);
const { locale, locales, setLocale, t } = useI18n();

function changeLocale(event) {
  const next = setLocale(event.target.value);
  emit('change', next);
}
</script>

<template>
  <label :class="['bw-language-switcher', compact && 'bw-language-switcher--compact']">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
    <span v-if="!compact">{{ t('common.language') }}</span>
    <select :value="locale" :aria-label="t('common.chooseLanguage')" @change="changeLocale">
      <option v-for="item in locales" :key="item.code" :value="item.code">
        {{ compact ? item.code.toUpperCase() : item.nativeLabel }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.bw-language-switcher {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border, rgba(127, 142, 155, 0.28));
  border-radius: var(--r-md, 12px);
  background: var(--surface-2, rgba(255, 255, 255, 0.06));
  color: var(--text, currentColor);
  font: inherit;
}
.bw-language-switcher svg { width: 18px; height: 18px; flex: 0 0 auto; }
.bw-language-switcher select {
  max-width: 8.5rem;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.bw-language-switcher select:focus-visible { outline: 2px solid var(--brand, #31c857); outline-offset: 3px; }
.bw-language-switcher--compact { min-width: 68px; justify-content: center; }
.bw-language-switcher--compact select { width: 2.8rem; }
@media (max-width: 520px) {
  .bw-language-switcher:not(.bw-language-switcher--compact) > span { display: none; }
}
</style>
