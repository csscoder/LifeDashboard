<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { SPACE_ICONS, type SpacePatch, type SpaceSummary } from '@lifedashboard/contracts/space'

import type { ThemeChoice } from '@lifedashboard/contracts/theme'
import { BUILTIN_PALETTE_IDS } from '../theme/palettes'
import ThemePicker from '../theme/ThemePicker.vue'

// Icon and theme of one space, one tab each. The selection is the server state: it changes only when the patch is saved.
const props = defineProps<{ space: SpaceSummary; disabled: boolean; inherited: ThemeChoice }>()
const emit = defineEmits<{ pick: [patch: SpacePatch]; close: [] }>()
const tab = ref<'icon' | 'theme'>('icon')

// A click outside the switcher closes the picker. Clicks on the corner button, the fan and the badges do not.
function onPointerDown(event: PointerEvent) {
  if (event.target instanceof Element && event.target.closest('.space-switcher')) return
  emit('close')
}

onMounted(() => document.addEventListener('pointerdown', onPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div class="space-picker" role="group" :aria-label="`Icon and theme: ${space.title}`">
    <!-- Both panels stay mounted (hidden), so the theme picker keeps its state across tab switches. -->
    <TabsRoot v-model="tab" class="space-picker__tabs" :unmount-on-hide="false">
      <TabsList class="space-picker__tab-list" aria-label="Space settings sections">
        <TabsTrigger value="icon" class="space-picker__tab">Icon</TabsTrigger>
        <TabsTrigger value="theme" class="space-picker__tab">Theme</TabsTrigger>
      </TabsList>
      <TabsContent value="icon" class="space-picker__panel">
        <div class="space-picker__icons">
          <button
            v-for="icon in SPACE_ICONS"
            :key="icon"
            type="button"
            class="space-picker__icon"
            :aria-label="icon"
            :aria-pressed="icon === space.icon"
            :disabled="disabled"
            @click="icon !== space.icon && emit('pick', { icon })"
          >
            {{ icon }}
          </button>
        </div>
      </TabsContent>
      <TabsContent value="theme" class="space-picker__panel">
        <ThemePicker :model-value="space.theme" inherit :inherited="inherited" :disabled="disabled"
          :unavailable="!!space.theme && !BUILTIN_PALETTE_IDS.has(space.theme.palette)"
          @update:model-value="$event !== 'bare' && emit('pick', { theme: $event })" />
      </TabsContent>
    </TabsRoot>
  </div>
</template>

<style scoped>
.space-picker {
  display: flex;
  flex-direction: column;
  width: 21.25rem;
  max-height: min(400px, calc(100vh - 3rem));
  padding: 0.875rem;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: 0.875rem;
  background: var(--ld-surface-2);
  box-shadow: var(--ld-shadow-raised);
}

.space-picker__tabs { display: flex; flex-direction: column; gap: 0.625rem; min-height: 0; }
.space-picker__tab-list { display: flex; flex: none; gap: 0.25rem; padding: 0.1875rem; border-radius: var(--ld-radius-control); background: var(--ld-state-hover); }
.space-picker__tab { flex: 1; min-width: 0; min-height: 1.75rem; padding: 0.25rem 0.5rem; border: 0; border-radius: calc(var(--ld-radius-control) - 0.1875rem); background: transparent; color: var(--ld-text-secondary); font: inherit; font-weight: 600; cursor: pointer; }
.space-picker__tab:hover { color: var(--ld-text-primary); }
.space-picker__tab[data-state='active'] { background: var(--ld-surface-3); color: var(--ld-text-primary); box-shadow: var(--ld-shadow-raised, none); }

/* The tab strip stays in place; the inset keeps focus rings inside the scrolling area. */
.space-picker__panel { min-height: 0; margin: -0.25rem; padding: 0.25rem; overflow-y: auto; }
.space-picker__panel[hidden] { display: none; }

.space-picker__icons {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 0.25rem;
}

.space-picker__icon {
  height: 2rem;
  padding: 0;
  border: var(--ld-border-width) solid transparent;
  border-radius: var(--ld-radius-control);
  background: none;
  font: inherit;
  font-size: 1.25rem;
  cursor: pointer;
}

.space-picker__icon:hover {
  background: var(--ld-state-hover);
}

.space-picker__icon[aria-pressed='true'] {
  border-color: var(--ld-accent);
  background: var(--ld-accent-subtle);
}

.space-picker :disabled { opacity: 0.5; cursor: default; }

.space-picker__icon:focus-visible {
  outline: 0.125rem solid var(--ld-focus-ring);
  outline-offset: 0.125rem;
}
</style>
