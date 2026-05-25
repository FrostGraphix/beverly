<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import IconSvg from './IconSvg.vue';
import { PORTAL_CARDS } from '../content';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && props.open) emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <transition name="lp-modal">
    <div v-if="open" class="lp-modal-backdrop" @click.self="emit('close')">
      <div class="lp-modal" role="dialog" aria-modal="true" aria-label="Choose your portal">
        <button class="lp-modal-close" type="button" aria-label="Close" @click="emit('close')">×</button>

        <div class="lp-modal-head">
          <span class="lp-brand-mark lp-brand-mark--lg"><IconSvg name="bolt" /></span>
          <h2>Where would you like to go?</h2>
          <p>Pick the experience that fits you. You can always switch later.</p>
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
            <strong>{{ p.key === 'customer' ? 'I buy electricity' : 'I sell electricity' }}</strong>
            <span class="lp-modal-choice-sub">{{ p.eyebrow }}</span>
            <span class="lp-modal-choice-go">{{ p.primaryLabel }} <IconSvg name="arrow" /></span>
          </a>
        </div>

        <p class="lp-modal-foot">
          Already have an account?
          <a :href="PORTAL_CARDS[0].secondaryHref">Customer sign in</a>
          <span>·</span>
          <a :href="PORTAL_CARDS[1].primaryHref">Vendor sign in</a>
        </p>
      </div>
    </div>
  </transition>
</template>
