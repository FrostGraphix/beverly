<script setup lang="ts">
/**
 * ConfirmDialog — single source of truth for all destructive/irreversible actions.
 *
 * v-model:open controls visibility. Emits 'confirm' on primary button, 'cancel'
 * on backdrop click, Esc key, or Cancel button.
 *
 * For inputs (e.g. rejection reason), use the default slot — its value rides
 * the parent's local ref. The dialog handles focus trap, scroll lock, and
 * destructive vs primary tone.
 *
 * Usage:
 *   <ConfirmDialog
 *     v-model:open="confirmOpen"
 *     title="Approve funding"
 *     :description="`Credit ${naira(amount)} to wallet #${id}?`"
 *     confirm-label="Approve"
 *     tone="brand"
 *     :loading="busy"
 *     @confirm="approve"
 *   />
 */
import { ref, watch, onBeforeUnmount, nextTick, computed } from 'vue';

const props = withDefaults(defineProps<{
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'brand' | 'danger' | 'warn';
    loading?: boolean;
    disableConfirm?: boolean;
}>(), {
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    tone: 'brand',
    loading: false,
    disableConfirm: false,
});

const emit = defineEmits<{
    (e: 'update:open', v: boolean): void;
    (e: 'confirm'): void;
    (e: 'cancel'): void;
}>();

const dialogEl = ref<HTMLElement | null>(null);
const confirmBtn = ref<HTMLButtonElement | null>(null);

const toneClass = computed(() => `tone-${props.tone}`);

function close() {
    if (props.loading) return;
    emit('update:open', false);
    emit('cancel');
}

function confirm() {
    if (props.loading || props.disableConfirm) return;
    emit('confirm');
}

function onKeydown(e: KeyboardEvent) {
    if (!props.open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Enter' && !props.disableConfirm && !props.loading) {
        // Only confirm on Enter if the focused element is the dialog body
        // (not a textarea — those need newlines).
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== 'TEXTAREA') { e.preventDefault(); confirm(); }
    }
}

let previouslyFocused: HTMLElement | null = null;

watch(() => props.open, async (isOpen) => {
    if (isOpen) {
        previouslyFocused = (document.activeElement as HTMLElement) ?? null;
        document.body.style.overflow = 'hidden';
        await nextTick();
        // Focus the first interactive element inside the dialog body, falling
        // back to the confirm button.
        const firstInput = dialogEl.value?.querySelector<HTMLElement>(
            'input:not([type="hidden"]), textarea, select, button.cd-input-target',
        );
        (firstInput ?? confirmBtn.value)?.focus();
    } else {
        document.body.style.overflow = '';
        previouslyFocused?.focus?.();
        previouslyFocused = null;
    }
});

document.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown);
    document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <Transition name="cd">
      <div v-if="open" class="cd-scrim" @click.self="close" role="presentation">
        <div
          ref="dialogEl"
          class="cd-dialog"
          :class="toneClass"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="`cd-title-${title}`"
        >
          <div class="cd-icon" :class="toneClass" aria-hidden="true">
            <svg v-if="tone === 'danger'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <circle cx="12" cy="17" r="0.5"/>
            </svg>
            <svg v-else-if="tone === 'warn'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="13"/>
              <circle cx="12" cy="16" r="0.5"/>
            </svg>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="9 12 11 14 16 9"/>
            </svg>
          </div>

          <h2 :id="`cd-title-${title}`" class="cd-title">{{ title }}</h2>
          <p v-if="description" class="cd-desc">{{ description }}</p>

          <div v-if="$slots.default" class="cd-body">
            <slot />
          </div>

          <div class="cd-actions">
            <button type="button" class="cd-btn cd-btn-cancel" :disabled="loading" @click="close">
              {{ cancelLabel }}
            </button>
            <button
              ref="confirmBtn"
              type="button"
              class="cd-btn cd-btn-confirm"
              :class="toneClass"
              :disabled="loading || disableConfirm"
              @click="confirm"
            >
              <span v-if="loading" class="cd-spinner" aria-hidden="true" />
              {{ loading ? 'Working…' : confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cd-scrim {
  position: fixed;
  inset: 0;
  background: oklch(0% 0 0 / 0.62);
  backdrop-filter: blur(4px);
  z-index: 9000;
  display: grid;
  place-items: center;
  padding: var(--s-5);
}

.cd-dialog {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  padding: var(--s-6);
  width: 100%;
  max-width: 440px;
  box-shadow: 0 32px 80px oklch(0% 0 0 / 0.50);
  position: relative;
  overflow: hidden;
}
.cd-dialog::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  opacity: 0.9;
}
.cd-dialog.tone-brand::before  { background: linear-gradient(90deg, transparent, var(--brand), transparent); }
.cd-dialog.tone-warn::before   { background: linear-gradient(90deg, transparent, var(--warn),  transparent); }
.cd-dialog.tone-danger::before { background: linear-gradient(90deg, transparent, var(--danger),transparent); }

.cd-icon {
  width: 40px; height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  margin: 0 0 var(--s-3);
}
.cd-icon.tone-brand  { background: oklch(from var(--brand)  l c h / 0.13); color: var(--brand); }
.cd-icon.tone-warn   { background: oklch(from var(--warn)   l c h / 0.13); color: var(--warn); }
.cd-icon.tone-danger { background: oklch(from var(--danger) l c h / 0.13); color: var(--danger); }

.cd-title {
  font-size: var(--t-lg);
  font-weight: 700;
  color: var(--text);
  margin: 0 0 var(--s-2);
  line-height: 1.3;
}
.cd-desc {
  font-size: var(--t-sm);
  color: var(--text-dim);
  line-height: 1.55;
  margin: 0;
}
.cd-body {
  margin-top: var(--s-4);
}

.cd-actions {
  display: flex;
  gap: var(--s-2);
  justify-content: flex-end;
  margin-top: var(--s-5);
}
.cd-btn {
  padding: 10px 18px;
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  transition: filter var(--dur-fast), opacity var(--dur-fast);
  min-height: 40px;
}
.cd-btn:hover:not(:disabled) { filter: brightness(1.10); }
.cd-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.cd-btn-cancel { background: transparent; color: var(--text-dim); }
.cd-btn-cancel:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }

.cd-btn-confirm.tone-brand  { background: var(--brand); border-color: var(--brand); color: white; }
.cd-btn-confirm.tone-warn   { background: var(--warn);  border-color: var(--warn);  color: oklch(20% 0 0); }
.cd-btn-confirm.tone-danger { background: var(--danger);border-color: var(--danger);color: white; }

.cd-spinner {
  width: 14px; height: 14px;
  border: 2px solid oklch(100% 0 0 / 0.30);
  border-top-color: white;
  border-radius: 50%;
  animation: cd-spin 0.7s linear infinite;
}
@keyframes cd-spin { to { transform: rotate(360deg); } }

.cd-enter-active, .cd-leave-active { transition: opacity 0.18s var(--ease-out); }
.cd-enter-from, .cd-leave-to { opacity: 0; }
.cd-enter-active .cd-dialog { animation: cd-pop 0.22s var(--ease-spring); }
@keyframes cd-pop {
  0%   { transform: translateY(8px) scale(0.96); opacity: 0; }
  100% { transform: translateY(0)    scale(1);    opacity: 1; }
}

@media (max-width: 480px) {
  .cd-dialog { padding: var(--s-5); max-width: 100%; }
  .cd-actions { flex-direction: column-reverse; }
  .cd-actions .cd-btn { width: 100%; justify-content: center; }
}
</style>
