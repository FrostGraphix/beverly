<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import IconSvg from './IconSvg.vue';
import { PORTAL_CARDS } from '../content';
import { useI18n } from '@beverly/tokens/i18n.js';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const { t } = useI18n();

function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && props.open) emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <transition name="lp-modal">
    <div v-if="open" class="lp-modal-backdrop" @click.self="emit('close')">
      <div class="lp-modal" role="dialog" aria-modal="true" :aria-label="t('landing.modal.label')">
        <button class="lp-modal-close" type="button" :aria-label="t('common.closeMenu')" @click="emit('close')">×</button>

        <div class="lp-modal-head">
          <span class="lp-brand-mark lp-brand-mark--lg"><IconSvg name="bolt" /></span>
          <h2>{{ t('landing.modal.title') }}</h2>
          <p>{{ t('landing.modal.subtitle') }}</p>
        </div>

        <div class="lp-modal-grid">
          <a
            v-for="p in PORTAL_CARDS"
            :key="p.key"
            :class="['lp-modal-choice', `lp-modal-choice--${p.accent}`]"
            :href="p.primaryHref"
          >
            <span class="lp-modal-choice-ic">
              <IconSvg :name="p.key === 'customer' ? 'user' : 'store'" />
            </span>
            <strong>{{ t(p.title) }}</strong>
            <span class="lp-modal-choice-sub">{{ t(p.eyebrow) }}</span>
            <span class="lp-modal-choice-go">{{ t(p.primaryLabel) }} <IconSvg name="arrow" /></span>
          </a>
        </div>

        <p class="lp-modal-foot">
          {{ t('landing.modal.existing') }}
          <a :href="PORTAL_CARDS[0].secondaryHref">{{ t('landing.modal.customerSignIn') }}</a>
          <span>·</span>
          <a :href="PORTAL_CARDS[1].primaryHref">{{ t('landing.modal.vendorSignIn') }}</a>
        </p>
      </div>
    </div>
  </transition>
</template>
