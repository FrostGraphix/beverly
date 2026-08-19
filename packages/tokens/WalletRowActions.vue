<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

export interface ActionItem {
  id?: string;
  label: string;
  action: () => void;
  icon?: 'view' | 'print' | 'copy' | 'send' | 'download' | 'dots';
  tone?: 'neutral' | 'brand' | 'warn' | 'danger' | 'success';
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    items: ActionItem[];
    label?: string;
    align?: 'center' | 'right' | 'left';
  }>(),
  {
    items: () => [],
    label: 'Row actions',
    align: 'center',
  }
);

const isOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);
const dropdownRef = ref<HTMLElement | null>(null);
const dropdownStyle = ref<Record<string, string>>({});

function updatePosition() {
  if (!triggerRef.value) return;
  const rect = triggerRef.value.getBoundingClientRect();
  const dropdownWidth = 175;
  
  let left = rect.right - dropdownWidth;
  if (left < 12) left = 12;
  if (left + dropdownWidth > window.innerWidth - 12) {
    left = window.innerWidth - dropdownWidth - 12;
  }
  
  const spaceBelow = window.innerHeight - rect.bottom;
  let top = rect.bottom + 6;
  let transform = 'none';

  if (spaceBelow < 220 && rect.top > 220) {
    top = rect.top - 6;
    transform = 'translateY(-100%)';
  }

  dropdownStyle.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${dropdownWidth}px`,
    transform,
    zIndex: '99999',
  };
}

function toggleMenu(event: Event) {
  event.stopPropagation();
  if (!isOpen.value) {
    updatePosition();
    isOpen.value = true;
    nextTick(() => updatePosition());
  } else {
    closeMenu();
  }
}

function closeMenu() {
  isOpen.value = false;
}

function handleAction(item: ActionItem, event: Event) {
  event.stopPropagation();
  if (item.disabled) return;
  closeMenu();
  item.action();
}

function handleDocClick(event: MouseEvent) {
  const target = event.target as Node;
  if (
    isOpen.value &&
    triggerRef.value && !triggerRef.value.contains(target) &&
    dropdownRef.value && !dropdownRef.value.contains(target)
  ) {
    closeMenu();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    closeMenu();
  }
}

function handleScrollOrResize() {
  if (isOpen.value) {
    updatePosition();
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocClick, true);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('scroll', handleScrollOrResize, true);
  window.addEventListener('resize', handleScrollOrResize);
});

onUnmounted(() => {
  document.removeEventListener('click', handleDocClick, true);
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('scroll', handleScrollOrResize, true);
  window.removeEventListener('resize', handleScrollOrResize);
});
</script>

<template>
  <div
    ref="menuRef"
    :class="['bw-row-actions-wrap', `align-${align}`]"
  >
    <!-- Single action optimization -->
    <template v-if="items.length === 1">
      <button
        type="button"
        :class="['bw-btn sm', items[0].tone ? items[0].tone : '']"
        :disabled="items[0].disabled"
        @click="(e) => handleAction(items[0], e)"
      >
        {{ items[0].label }}
      </button>
    </template>

    <!-- Multiple actions (3 dots dropdown) -->
    <template v-else-if="items.length > 1">
      <button
        ref="triggerRef"
        type="button"
        class="bw-row-actions-trigger"
        :aria-label="label"
        aria-haspopup="menu"
        :aria-expanded="isOpen"
        @click="toggleMenu"
      >
        <svg class="bw-row-actions-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
        </svg>
      </button>

      <Teleport to="body">
        <Transition name="bw-row-actions-pop">
          <div
            v-if="isOpen"
            ref="dropdownRef"
            class="bw-row-actions-dropdown bw-teleported-menu"
            role="menu"
            :aria-label="label"
            :style="dropdownStyle"
            @click.stop
          >
            <button
              v-for="(item, idx) in items"
              :key="item.id || item.label || idx"
              type="button"
              :class="['bw-row-action-item', item.tone || 'neutral', { disabled: item.disabled }]"
              role="menuitem"
              :disabled="item.disabled"
              @click="(e) => handleAction(item, e)"
            >
              <!-- View icon -->
              <svg v-if="item.icon === 'view'" class="bw-row-action-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <!-- Print icon -->
              <svg v-else-if="item.icon === 'print'" class="bw-row-action-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              <!-- Copy icon -->
              <svg v-else-if="item.icon === 'copy'" class="bw-row-action-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <!-- Remote Send icon -->
              <svg v-else-if="item.icon === 'send'" class="bw-row-action-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              <!-- Download icon -->
              <svg v-else-if="item.icon === 'download'" class="bw-row-action-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>

              <span>{{ item.label }}</span>
            </button>
          </div>
        </Transition>
      </Teleport>
    </template>
  </div>
</template>

<style scoped>
.bw-row-actions-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.bw-row-actions-wrap.align-center {
  justify-content: center;
  width: 100%;
}
.bw-row-actions-wrap.align-right {
  justify-content: flex-end;
}
.bw-row-actions-wrap.align-left {
  justify-content: flex-start;
}

.bw-row-actions-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid oklch(70% 0.19 145 / 0.22);
  border-radius: var(--r-md, 8px);
  background: var(--surface-2, rgba(255, 255, 255, 0.05));
  color: var(--text-2, #94a3b8);
  cursor: pointer;
  transition: all 0.18s ease;
}

.bw-row-actions-trigger:hover,
.bw-row-actions-trigger[aria-expanded="true"] {
  background: oklch(70% 0.19 145 / 0.16);
  color: var(--brand, #22c55e);
  border-color: var(--brand, #22c55e);
  box-shadow: 0 0 0 2px oklch(70% 0.19 145 / 0.18);
}

.bw-row-actions-icon {
  width: 18px;
  height: 18px;
}

.bw-row-actions-dropdown {
  position: fixed;
  z-index: 99999;
  min-width: 175px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--surface-1, #11141c);
  border: 1px solid var(--border, oklch(70% 0.19 145 / 0.35));
  border-radius: var(--r-lg, 12px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  transform-origin: top right;
}

.bw-row-action-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: var(--r-md, 8px);
  background: transparent;
  color: var(--text-main, var(--text, #f8fafc));
  font-size: var(--t-xs, 13px);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.bw-row-action-item:hover:not(:disabled) {
  background: oklch(70% 0.19 145 / 0.14);
  color: var(--brand, #22c55e);
}

.bw-row-action-item.brand {
  color: var(--brand, #22c55e);
}

.bw-row-action-item.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.bw-row-action-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bw-row-action-ic {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

/* Light Theme Overrides */
[data-theme="light"] .bw-row-actions-trigger {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #475569;
}
[data-theme="light"] .bw-row-actions-trigger:hover,
[data-theme="light"] .bw-row-actions-trigger[aria-expanded="true"] {
  background: #e2e8f0;
  color: #15803d;
  border-color: #16a34a;
}
[data-theme="light"] .bw-row-actions-dropdown {
  background: #ffffff !important;
  border-color: rgba(0, 0, 0, 0.14) !important;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.05) !important;
}
[data-theme="light"] .bw-row-action-item {
  color: #1e293b !important;
}
[data-theme="light"] .bw-row-action-item:hover:not(:disabled) {
  background: rgba(22, 163, 74, 0.1) !important;
  color: #15803d !important;
}

.bw-row-actions-pop-enter-active,
.bw-row-actions-pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.bw-row-actions-pop-enter-from,
.bw-row-actions-pop-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(-4px);
}
</style>
