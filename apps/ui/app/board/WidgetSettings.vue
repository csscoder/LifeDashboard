<script setup lang="ts">
import { computed, ref, useId, useTemplateRef, watch, type Component } from 'vue'
import {
  BARE_THEME_ID,
  DEFAULT_SHADOW,
  SHADOW_LIMITS,
  type DropShadow,
  type WidgetAppearance,
} from '@lifedashboard/contracts/board'
import type { SettingsSchema } from '@lifedashboard/contracts/widget-settings'
import { BUILTIN_THEMES } from '../theme/builtin'
import { panelPosition, styleValue, withShadow, withStyle } from './widget-settings'
import UiSelect from '../ui/UiSelect.vue'
import WidgetConfigForm from './WidgetConfigForm.vue'

// One per board: a non-modal popover beside the widget being tuned, anchored to the widget item so its
// «⚙» and «×» stay clear. It sits in the top layer, so the board never clips it; light dismiss and Esc
// are native (spec «Host UI»).
const props = defineProps<{
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
const uid = useId()
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

const valueOf = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value

function setStyle(value: string) {
  emit('change', withStyle(props.appearance, value))
}

function setShadowOn(event: Event) {
  emit('change', withShadow(props.appearance, (event.target as HTMLInputElement).checked ? DEFAULT_SHADOW : null))
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
      <div class="settings__row">
        <label class="settings__label" :for="`${uid}-version`">Version</label>
        <UiSelect :id="`${uid}-version`" v-model="selectedVersion" :options="versionOptions" />
      </div>
      <button type="button" class="settings__reset" :disabled="selectedVersion === version" @click="emit('version', selectedVersion)">Apply version</button>
      <p class="settings__version-hint">Changing the version keeps the board changes and the widget data. Secrets whose binding changed must be set again.</p>
    </template>
    <div class="settings__row">
      <label class="settings__label" :for="`${uid}-style`">Style</label>
      <UiSelect :id="`${uid}-style`" :model-value="styleValue(appearance)" :options="styleOptions" @update:model-value="setStyle" />
    </div>
    <label class="settings__row">
      <span class="settings__label">Shadow</span>
      <input type="checkbox" :checked="shadow !== null" @change="setShadowOn" />
    </label>
    <template v-if="shadow">
      <!-- The value sits outside the label, so a slider's accessible name does not change while it is dragged. -->
      <div v-for="item in offsets" :key="item.key" class="settings__row">
        <label class="settings__label" :for="`${uid}-${item.key}`">{{ item.label }}</label>
        <input
          :id="`${uid}-${item.key}`"
          type="range"
          class="settings__control"
          :min="item.limits[0]"
          :max="item.limits[1]"
          step="1"
          :value="shadow[item.key]"
          @input="setShadow(item.key, Number(valueOf($event)))"
        />
        <output class="settings__value">{{ shadow[item.key] }} px</output>
      </div>
      <label class="settings__row">
        <span class="settings__label">Color</span>
        <input type="color" :value="shadow.color" @input="setShadow('color', valueOf($event))" />
      </label>
      <div class="settings__row">
        <label class="settings__label" :for="`${uid}-opacity`">Opacity</label>
        <input
          :id="`${uid}-opacity`"
          type="range"
          class="settings__control"
          min="0"
          max="100"
          step="1"
          :value="percent"
          @input="setShadow('opacity', Number(valueOf($event)) / 100)"
        />
        <output class="settings__value">{{ percent }} %</output>
      </div>
    </template>
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
    <div class="settings__footer">
      <button type="button" class="settings__reset" @click="emit('reset')">Reset widget settings</button>
    </div>
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

.settings__row {
  display: grid;
  grid-template-columns: 6.5rem 1fr 2.75rem;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.75rem;
}

.settings__row > input[type='checkbox'] {
  justify-self: start;
  margin: 0;
}

/* Deep: the widget's own settings form is a child component. */
.settings :deep(input) {
  accent-color: var(--ld-accent);
}

.settings__label {
  color: var(--ld-text-secondary);
}

.settings__version-hint {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--ld-text-secondary);
}

.settings__control {
  min-width: 0;
}

/* The select has no value column: it spans the control and value columns so long names fit. */
.settings__row :deep(.ui-select-field) {
  grid-column: 2 / -1;
}

.settings__footer {
  padding-top: 0.5rem;
  border-top: var(--ld-border-width) solid var(--ld-border-default);
}

.settings__value {
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.settings__reset {
  justify-self: start;
  padding: 0.125rem 0.625rem;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: var(--ld-radius-control);
  background: var(--ld-surface-3);
  color: var(--ld-text-primary);
  font: inherit;
  cursor: pointer;
}

.settings input:focus-visible,
.settings__reset:focus-visible {
  outline: 0.125rem solid var(--ld-focus-ring);
  outline-offset: 0.125rem;
}
</style>
