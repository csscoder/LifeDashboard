<script setup lang="ts">
import { computed, ref, useTemplateRef, watch, type Component } from 'vue'
import {
  BARE_THEME_ID,
  DEFAULT_SHADOW,
  SHADOW_LIMITS,
  type DropShadow,
  type WidgetAppearance,
} from '@lifedashboard/contracts/board'
import type { SettingsSchema } from '@lifedashboard/contracts/widget-settings'
import { BUILTIN_THEMES } from '../theme/builtin'
import { panelPosition, styleValue, withShadow, withStyle, withVariant } from './widget-settings'
import { resolveVariant, type WidgetVariants } from '@lifedashboard/contracts/widget-variants'
import { Separator } from 'reka-ui'
import SettingsRow from './SettingsRow.vue'
import UiButton from '../ui/UiButton.vue'
import UiSwitch from '../ui/UiSwitch.vue'
import UiSlider from '../ui/UiSlider.vue'
import UiColorField from '../ui/UiColorField.vue'
import UiSelect from '../ui/UiSelect.vue'
import WidgetConfigForm from './WidgetConfigForm.vue'

// One per board: a non-modal popover beside the widget being tuned, anchored to the widget item so its
// «⚙» and «×» stay clear. It sits in the top layer, so the board never clips it; light dismiss and Esc
// are native (spec «Host UI»).
const props = defineProps<{
  variants?: WidgetVariants
  appearance: WidgetAppearance | undefined
  schema: SettingsSchema | undefined
  config: Record<string, unknown>
  widgetId: string | null
  secrets: ReadonlySet<string>
  version: string
  versions: string[]
  // A built-in widget's own settings form; it replaces the generic one built from the schema.
  editor?: Component
}>()
const emit = defineEmits<{
  change: [next: WidgetAppearance | null]
  config: [next: Record<string, unknown>]
  toggle: [open: boolean]
  version: [version: string]
  reset: []
}>()

const panel = useTemplateRef<HTMLElement>('panelBox')
const selectedVersion = ref(props.version)
watch(() => [props.widgetId, props.version], () => { selectedVersion.value = props.version })
const shadow = computed(() => props.appearance?.shadow ?? null)
// The shadow controls are shown only while the shadow is on.
const percent = computed(() => Math.round((shadow.value?.opacity ?? 0) * 100))
const offsets = [
  { key: 'x', label: 'X', limits: SHADOW_LIMITS.x },
  { key: 'y', label: 'Y', limits: SHADOW_LIMITS.y },
  { key: 'blur', label: 'Blur', limits: SHADOW_LIMITS.blur },
] as const
const styleOptions = [
  { value: '', label: 'Same as board' },
  ...BUILTIN_THEMES.map((theme) => ({ value: theme.id, label: theme.name })),
  { value: BARE_THEME_ID, label: 'No frame' },
]
const versionOptions = computed(() => props.versions.map((item) => ({ value: item, label: item })))

function isOpen(): boolean {
  return panel.value?.matches(':popover-open') ?? false
}

// Measured after showPopover(): a hidden popover has no size.
function open(anchor: Element) {
  const el = panel.value
  if (!el) return
  if (!isOpen()) el.showPopover()
  const { left, top } = panelPosition(anchor.getBoundingClientRect(), el.getBoundingClientRect(), {
    width: window.innerWidth,
    height: window.innerHeight,
  })
  el.style.left = `${left}px`
  el.style.top = `${top}px`
}

function close() {
  if (isOpen()) panel.value?.hidePopover()
}

// Focus moved to another element: the board keyboard would stay locked out while the panel is open. A null
// relatedTarget (a native colour or select popup, the window losing focus) keeps the panel open. The panel's
// tabindex takes the focus of a click on its text; else the board's <main tabindex="-1"> would, closing it.
function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget
  if (next instanceof Element && !panel.value?.contains(next)) close()
}

function onToggle(event: ToggleEvent) {
  const opened = event.newState === 'open'
  if (opened) panel.value?.querySelector<HTMLElement>('.ui-select')?.focus()
  emit('toggle', opened)
}

function setStyle(value: string) {
  emit('change', withStyle(props.appearance, value))
}

function setShadowOn(enabled: boolean) {
  emit('change', withShadow(props.appearance, enabled ? DEFAULT_SHADOW : null))
}

function setShadow<K extends keyof DropShadow>(key: K, value: DropShadow[K]) {
  if (shadow.value) emit('change', withShadow(props.appearance, { ...shadow.value, [key]: value }))
}

defineExpose({ open, close, isOpen })
</script>

<template>
  <div
    ref="panelBox"
    popover="auto"
    role="dialog"
    aria-label="Widget settings"
    tabindex="-1"
    class="settings"
    @toggle="onToggle"
    @focusout="onFocusOut"
  >
    <template v-if="versions.length > 0">
      <h2 class="settings__heading">Package</h2>
      <SettingsRow label="Version"><UiSelect v-model="selectedVersion" :options="versionOptions" /></SettingsRow>
      <UiButton :disabled="selectedVersion === version" @click="emit('version', selectedVersion)">Apply version</UiButton>
      <p class="settings__version-hint">Changing the version keeps the board changes and the widget data. Secrets whose binding changed must be set again.</p>
      <Separator class="settings__separator" />
    </template>
    <h2 class="settings__heading">Appearance</h2>
    <SettingsRow label="Style"><UiSelect :model-value="styleValue(appearance)" :options="styleOptions" @update:model-value="setStyle" /></SettingsRow>
    <SettingsRow v-if="variants" label="Look">
      <UiSelect :model-value="resolveVariant(variants, appearance?.variant)" :options="variants.items.map(item => ({ value: item.id, label: item.title }))" @update:model-value="emit('change', withVariant(appearance, $event))" />
    </SettingsRow>
    <SettingsRow label="Shadow"><UiSwitch :model-value="shadow !== null" @update:model-value="setShadowOn" /></SettingsRow>
    <template v-if="shadow">
      <SettingsRow v-for="item in offsets" :key="item.key" :label="item.label" :value="`${shadow[item.key]} px`">
        <UiSlider :aria-label="item.label" :model-value="shadow[item.key]" :min="item.limits[0]" :max="item.limits[1]" @update:model-value="setShadow(item.key, $event)" />
      </SettingsRow>
      <SettingsRow label="Opacity" :value="`${percent} %`">
        <UiSlider aria-label="Opacity" :model-value="percent" :min="0" :max="100" @update:model-value="setShadow('opacity', $event / 100)" />
      </SettingsRow>
      <SettingsRow label="Color"><UiColorField aria-label="Color" :model-value="shadow.color" @update:model-value="setShadow('color', $event)" /></SettingsRow>
    </template>
    <Separator class="settings__separator" />
    <h2 class="settings__heading">Widget</h2>
    <component
      :is="editor"
      v-if="editor && schema"
      :key="`editor:${widgetId ?? 'unsaved'}`"
      :schema="schema"
      :config="config"
      @change="emit('config', $event)"
    />
    <WidgetConfigForm
      v-else-if="schema && Object.keys(schema.properties).length > 0"
      :key="widgetId ?? 'unsaved'"
      :schema="schema"
      :config="config"
      :widget-id="widgetId"
      :secrets="secrets"
      @change="emit('config', $event)"
    />
    <Separator class="settings__separator" />
    <div class="settings__footer"><UiButton @click="emit('reset')">Reset to defaults</UiButton></div>
  </div>
</template>

<style scoped>
/* The UA centres a popover (inset: 0; margin: auto); open() sets left and top. A hidden popover keeps
   the UA display: none, so display is set only while open. */
.settings {
  position: fixed;
  inset: auto;
  margin: 0;
  width: 18rem;
  max-height: calc(100dvh - 2rem);
  overflow-y: auto;
  padding: 0.625rem 0.75rem;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: var(--ld-radius-card);
  background: var(--ld-surface-2);
  color: var(--ld-text-primary);
  box-shadow: var(--ld-shadow-raised, none);
  font: inherit;
  /* Its own size: the board scales its font with the grid, the panel stays compact. */
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

.settings:popover-open {
  display: grid;
  gap: 0.375rem;
}

.settings__heading { margin: 0; font: inherit; font-weight: 600; }
.settings__version-hint { margin: 0; font-size: 0.75rem; line-height: 1rem; color: var(--ld-text-secondary); }
.settings__separator { height: var(--ld-border-width); background: var(--ld-border-default); margin: 0.5rem 0; }
.settings__footer { display: flex; }
</style>
