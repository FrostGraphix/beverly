<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatNotificationBody } from './notification-content.js';

interface NotificationDetail {
    title: string;
    body: string;
    metadata?: { path?: string } | Record<string, unknown>;
}

const props = withDefaults(defineProps<{
    notification: NotificationDetail;
    typeLabel?: string;
    formattedDate?: string;
    actionLabel?: string;
}>(), {
    typeLabel: 'Update',
    formattedDate: '',
    actionLabel: 'View related page',
});

defineEmits<{
    close: [];
    navigate: [];
}>();

const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
const previousOverflow = document.body.style.overflow;
const blocks = computed(() => formatNotificationBody(props.notification.body));
const hasPath = computed(() => typeof props.notification.metadata?.path === 'string' && Boolean(props.notification.metadata.path));

function trapFocus(event: KeyboardEvent) {
    const focusable = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])') ?? [])
        .filter((element) => !element.hasAttribute('disabled'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

onMounted(async () => {
    document.body.style.overflow = 'hidden';
    await nextTick();
    closeButton.value?.focus();
});

onBeforeUnmount(() => {
    document.body.style.overflow = previousOverflow;
    restoreFocus?.focus();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="notification-detail">
      <div class="notification-detail__scrim" role="presentation" @click.self="$emit('close')">
        <section
          ref="dialog"
          class="notification-detail__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notification-detail-title"
          aria-describedby="notification-detail-content"
          @keydown.esc.prevent="$emit('close')"
          @keydown.tab="trapFocus"
        >
          <header class="notification-detail__header">
            <div class="notification-detail__heading">
              <span class="notification-detail__type">{{ typeLabel }}</span>
              <h2 id="notification-detail-title">{{ notification.title }}</h2>
              <time v-if="formattedDate">{{ formattedDate }}</time>
            </div>
            <button ref="closeButton" type="button" class="notification-detail__close" @click="$emit('close')">
              Close
            </button>
          </header>

          <div id="notification-detail-content" class="notification-detail__content">
            <template v-for="(block, index) in blocks" :key="`${block.kind}-${index}`">
              <p v-if="block.kind === 'paragraph'" class="notification-detail__paragraph">{{ block.text }}</p>
              <div v-else class="notification-detail__item">
                <strong aria-hidden="true">{{ block.marker }}</strong>
                <p>{{ block.text }}</p>
              </div>
            </template>
          </div>

          <footer v-if="hasPath" class="notification-detail__footer">
            <button type="button" class="notification-detail__action" @click="$emit('navigate')">
              {{ actionLabel }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.notification-detail__scrim {
    position: fixed;
    inset: 0;
    z-index: 2147482000;
    display: grid;
    place-items: center;
    padding: clamp(16px, 4vw, 48px);
    background: color-mix(in oklab, #020908 76%, transparent);
    backdrop-filter: blur(12px);
}
.notification-detail__dialog {
    width: min(720px, 100%);
    max-height: min(82vh, 820px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid color-mix(in oklab, var(--brand) 28%, var(--border));
    border-radius: clamp(20px, 3vw, 30px);
    background: color-mix(in oklab, var(--surface) 96%, #000);
    color: var(--text);
    box-shadow: 0 32px 90px rgb(0 0 0 / .54), inset 0 1px rgb(255 255 255 / .05);
}
.notification-detail__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-4);
    padding: clamp(20px, 4vw, 34px);
    border-bottom: 1px solid var(--border);
    background: linear-gradient(135deg, color-mix(in oklab, var(--brand) 10%, transparent), transparent 60%);
}
.notification-detail__heading { min-width: 0; }
.notification-detail__type {
    display: block;
    margin-bottom: var(--s-2);
    color: var(--brand);
    font-size: var(--t-xs);
    font-weight: 850;
    letter-spacing: .12em;
    text-transform: uppercase;
}
.notification-detail__heading h2 {
    margin: 0;
    max-width: 22ch;
    font-size: clamp(1.35rem, 4vw, 2rem);
    line-height: 1.18;
    text-wrap: balance;
}
.notification-detail__heading time {
    display: block;
    margin-top: var(--s-2);
    color: var(--text-muted, var(--text-dim));
    font-size: var(--t-xs);
}
.notification-detail__close {
    min-height: 42px;
    padding: 0 var(--s-3);
    border: 1px solid var(--border);
    border-radius: 999px;
    background: color-mix(in oklab, var(--surface) 86%, transparent);
    color: var(--text);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 750;
    cursor: pointer;
}
.notification-detail__close:hover { border-color: var(--brand); color: var(--brand); }
.notification-detail__close:focus-visible,
.notification-detail__action:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
.notification-detail__content {
    overflow-y: auto;
    padding: clamp(20px, 4vw, 34px);
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
}
.notification-detail__paragraph {
    margin: 0 0 var(--s-4);
    color: var(--text);
    font-size: clamp(var(--t-sm), 2vw, var(--t-base));
    line-height: 1.75;
    white-space: pre-wrap;
}
.notification-detail__item {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: var(--s-3);
    align-items: start;
    margin: 0 0 var(--s-3);
    padding: var(--s-3);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: color-mix(in oklab, var(--brand) 5%, transparent);
}
.notification-detail__item > strong {
    min-height: 36px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: color-mix(in oklab, var(--brand) 15%, transparent);
    color: var(--brand);
    font-size: var(--t-sm);
}
.notification-detail__item p { margin: 0; line-height: 1.7; white-space: pre-wrap; }
.notification-detail__footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--s-3) clamp(20px, 4vw, 34px);
    border-top: 1px solid var(--border);
}
.notification-detail__action {
    min-height: 44px;
    padding: 0 var(--s-4);
    border: 0;
    border-radius: 999px;
    background: var(--brand);
    color: #03110a;
    font: inherit;
    font-weight: 850;
    cursor: pointer;
}
.notification-detail-enter-active,
.notification-detail-leave-active { transition: opacity .18s ease; }
.notification-detail-enter-active .notification-detail__dialog,
.notification-detail-leave-active .notification-detail__dialog { transition: transform .22s cubic-bezier(.22, 1, .36, 1), opacity .18s ease; }
.notification-detail-enter-from,
.notification-detail-leave-to { opacity: 0; }
.notification-detail-enter-from .notification-detail__dialog,
.notification-detail-leave-to .notification-detail__dialog { opacity: 0; transform: translateY(18px) scale(.985); }
@media (max-width: 640px) {
    .notification-detail__scrim { place-items: end center; padding: 0; }
    .notification-detail__dialog { max-height: 90dvh; border-radius: 26px 26px 0 0; }
    .notification-detail__header { padding: 22px 20px 18px; }
    .notification-detail__content { padding: 20px; }
    .notification-detail__item { grid-template-columns: 38px minmax(0, 1fr); padding: var(--s-2); }
}
@media (prefers-reduced-motion: reduce) {
    .notification-detail-enter-active,
    .notification-detail-leave-active,
    .notification-detail-enter-active .notification-detail__dialog,
    .notification-detail-leave-active .notification-detail__dialog { transition: none; }
}
</style>
