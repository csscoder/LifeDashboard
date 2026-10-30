<script setup lang="ts">
import { computed, ref, useTemplateRef, watch, type Component } from 'vue'
import {
  DEFAULT_SHADOW,
  SCALE_LIMITS,
  SHADOW_LIMITS,
  type DropShadow,
  type WidgetAppearance,
} from '@lifedashboard/contracts/board'
import type { SettingsSchema } from '@lifedashboard/contracts/widget-settings'
import type { ThemeChoice } from '@lifedashboard/contracts/theme'
import { BUILTIN_PALETTE_IDS } from '../theme/palettes'
import ThemePicker from '../theme/ThemePicker.vue'
import { panelMaxHeight, panelPosition, withScale, withShadow, withStyle, withVariant } from './widget-settings'
import { resolveVariant, type WidgetVariants } from '@lifedashboard/contracts/widget-variants'
import { Separator, TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import SettingsRow from './SettingsRow.vue'
import UiButton from '../ui/UiButton.vue'
import UiSwitch from '../ui/UiSwitch.vue'
import UiSlider from '../ui/UiSlider.vue'
import UiColorField from '../ui/UiColorField.vue'
import UiSelect from '../ui/UiSelect.vue'
import UiNumberField from '../ui/UiNumberField.vue'
import WidgetConfigForm from './WidgetConfigForm.vue'

// One per board: a non-modal popover beside the widget being tuned, anchored to the widget item so its
// «⚙» and «×» stay clear. It sits in the top layer, so the board never clips it; light dismiss and Esc
// are native (spec «Host UI»).
const props = defineProps<{
  inherited: ThemeChoice
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
const offsets = [
  { key: 'x', label: 'X', limits: SHADOW_LIMITS.x },
  { key: 'y', label: 'Y', limits: SHADOW_LIMITS.y },
  { key: 'blur', label: 'Blur', limits: SHADOW_LIMITS.blur },
] as const
// A built-in editor needs no schema; the generic form needs at least one setting.
const hasWidgetBlock = computed(() => Boolean(props.editor || (props.schema && Object.keys(props.schema.properties).length > 0)))
const versionOptions = computed(() => props.versions.map((item) => ({ value: item, label: item })))
// The widget's own settings come first and open by default; another widget opens on its first tab again.
const firstTab = () => (hasWidgetBlock.value ? 'widget' : 'style')
const tab = ref(firstTab())
watch(() => props.widgetId, () => { tab.value = firstTab() })
watch(hasWidgetBlock, (has) => { if (!has && tab.value === 'widget') tab.value = 'style' })

function isOpen(): boolean {
  return panel.value?.matches(':popover-open') ?? false
}

// Measured after showPopover(): a hidden popover has no size.
function open(anchor: Element) {
  const el = panel.value
  if (!el) return
  // The height limit comes first: the position is measured from the limited size.
  el.style.setProperty('--panel-max-height', `${panelMaxHeight(anchor.getBoundingClientRect().height, window.innerHeight)}px`)
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
  if (opened) panel.value?.querySelector<HTMLElement>('button')?.focus()
  emit('toggle', opened)
}

function setStyle(value: ThemeChoice | 'bare' | null) {
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
    <div class="settings__scroll">
    <!-- Both kinds of panels stay mounted (hidden), so an open colour picker or form keeps its state across tabs. -->
    <TabsRoot v-model="tab" class="settings__tabs" :unmount-on-hide="false">
      <TabsList class="settings__tab-list" aria-label="Widget settings sections">
        <TabsTrigger v-if="hasWidgetBlock" value="widget" class="settings__tab">Widget</TabsTrigger>
        <TabsTrigger value="style" class="settings__tab">Style</TabsTrigger>
        <TabsTrigger value="display" class="settings__tab">Display</TabsTrigger>
        <TabsTrigger v-if="versions.length > 0" value="package" class="settings__tab">Package</TabsTrigger>
      </TabsList>
      <TabsContent v-if="hasWidgetBlock" value="widget" class="settings__panel">
        <component
          :is="editor"
          v-if="editor"
          :key="`editor:${widgetId ?? 'unsaved'}`"
          :schema="schema"
          :config="config"
          @change="emit('config', $event)"
        />
        <WidgetConfigForm
          v-else
          :key="widgetId ?? 'unsaved'"
          :schema="schema!"
          :config="config"
          :widget-id="widgetId"
          :secrets="secrets"
          @change="emit('config', $event)"
        />
      </TabsContent>
      <TabsContent value="style" class="settings__panel">
        <ThemePicker :model-value="appearance?.theme ?? null" inherit bare :inherited="inherited"
          :unavailable="!!appearance?.theme && appearance.theme !== 'bare' && !BUILTIN_PALETTE_IDS.has(appearance.theme.palette)"
          @update:model-value="setStyle" />
      </TabsContent>
      <TabsContent value="display" class="settings__panel">
        <SettingsRow v-if="variants" label="Look">
          <UiSelect :model-value="resolveVariant(variants, appearance?.variant)" :options="variants.items.map(item => ({ value: item.id, label: item.title }))" @update:model-value="emit('change', withVariant(appearance, $event))" />
        </SettingsRow>
        <SettingsRow label="Text size, %">
          <UiNumberField integer stepper :min="SCALE_LIMITS[0]" :max="SCALE_LIMITS[1]" :model-value="appearance?.scale ?? 0"
            @update:model-value="emit('change', withScale(appearance, $event))" />
        </SettingsRow>
        <SettingsRow label="Shadow"><UiSwitch :model-value="shadow !== null" @update:model-value="setShadowOn" /></SettingsRow>
        <template v-if="shadow">
          <SettingsRow v-for="item in offsets" :native-label="false" :key="item.key" :label="item.label" :value="`${shadow[item.key]} px`">
            <UiSlider :aria-label="item.label" :model-value="shadow[item.key]" :min="item.limits[0]" :max="item.limits[1]" @update:model-value="setShadow(item.key, $event)" />
          </SettingsRow>
          <SettingsRow label="Color">
            <UiColorField :model-value="shadow.color" :alpha="shadow.opacity" @update:model-value="setShadow('color', $event)" @update:alpha="setShadow('opacity', $event)" />
          </SettingsRow>
        </template>
      </TabsContent>
      <TabsContent v-if="versions.length > 0" value="package" class="settings__panel">
        <SettingsRow label="Version"><UiSelect v-model="selectedVersion" :options="versionOptions" /></SettingsRow>
        <UiButton :disabled="selectedVersion === version" @click="emit('version', selectedVersion)">Apply version</UiButton>
        <p class="settings__version-hint">Changing the version keeps the board changes and the widget data. Secrets whose binding changed must be set again.</p>
      </TabsContent>
    </TabsRoot>
    <Separator class="settings__separator" />
    <div class="settings__footer"><UiButton @click="emit('reset')">Reset to defaults</UiButton></div>
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
  padding: 0; /* the UA pads a popover; the scroller has its own padding */
  width: 21rem;
  max-width: calc(100vw - 1.5rem);
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

/* The panel itself does not scroll: a colour picker opens as its child, outside the scroller, so it is not
   clipped by the panel edge (WebKit clips it) and can extend past the panel. */
.settings:popover-open { display: block; overflow: visible; } /* the UA gives a popover overflow: auto */

/* A flex column, not a grid: with the max-height, WebKit (the desktop app) sizes the auto rows of a
   scrolling grid too small and the rows overlap. Rows keep their content height. */
.settings__scroll {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-height: calc(var(--panel-max-height, calc(100dvh - 2rem)) - 2 * var(--ld-border-width)); /* inside the panel border */
  overflow-y: auto;
  padding: 0.625rem 0.75rem;
  border-radius: inherit;
}

.settings__scroll > * { flex: none; }

.settings__tab-list { display: flex; gap: 0.25rem; margin-bottom: 0.375rem; padding: 0.1875rem; border-radius: var(--ld-radius-control); background: var(--ld-state-hover); }
.settings__tab { flex: 1; min-width: 0; min-height: 1.75rem; padding: 0.25rem 0.5rem; border: 0; border-radius: calc(var(--ld-radius-control) - 0.1875rem); background: transparent; color: var(--ld-text-secondary); font: inherit; font-weight: 600; cursor: pointer; }
.settings__tab:hover { color: var(--ld-text-primary); }
.settings__tab[data-state='active'] { background: var(--ld-surface-3); color: var(--ld-text-primary); box-shadow: var(--ld-shadow-raised, none); }
.settings__tab:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.settings__panel { display: flex; flex-direction: column; gap: 0.375rem; }
.settings__panel[hidden] { display: none; }
.settings__version-hint { margin: 0; font-size: 0.75rem; line-height: 1rem; color: var(--ld-text-secondary); }
.settings__separator { height: var(--ld-border-width); background: var(--ld-border-default); margin: 0.5rem 0; }
.settings__footer { display: flex; }
</style>
