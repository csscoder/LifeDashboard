<script setup lang="ts">
import { computed, useId } from 'vue'
import { RadioGroupRoot, RadioGroupItem } from 'reka-ui'
import type { ThemeChoice } from '@lifedashboard/contracts/theme'
import UiRadioGroup from '../ui/UiRadioGroup.vue'
import UiSelect from '../ui/UiSelect.vue'
import { BUILTIN_PALETTES } from './palettes'
import { DEFAULT_THEME, themeKey } from './builtin'
import { useColorScheme } from './color-scheme'
import { BUILTIN_FONTS, BUILTIN_FONT_SLUGS, fontVars, withFont } from './fonts'

const props = defineProps<{ modelValue: ThemeChoice | 'bare' | null; inherit?: boolean; bare?: boolean; inherited?: ThemeChoice; unavailable?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: ThemeChoice | 'bare' | null] }>()
const id = useId()
const scheme = useColorScheme()
const selected = computed(() => props.modelValue && props.modelValue !== 'bare' && !props.unavailable ? props.modelValue : null)
const effective = computed(() => selected.value ?? props.inherited ?? DEFAULT_THEME)
const inheritedPaletteName = computed(() => BUILTIN_PALETTES.find(item => `builtin:${item.slug}` === (props.inherited ?? DEFAULT_THEME).palette)?.name ?? (props.inherited ?? DEFAULT_THEME).palette)
const palette = computed(() => props.modelValue === 'bare' ? 'bare' : selected.value?.palette ?? 'inherit')
const dimensionsDisabled = computed(() => props.disabled || !selected.value)
const modes = [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Auto' }]
const styles = [{ value: 'solid', label: 'Solid' }, { value: 'glass', label: 'Glass' }]
const fontOptions = [{ value: '', label: 'Theme default' }, ...BUILTIN_FONTS.map(font => ({ value: font.slug, label: font.name }))]
const fontRows = [{ key: 'heading', label: 'Heading font' }, { key: 'body', label: 'Body font' }] as const
// An unknown stored slug shows as Theme default without being rewritten.
const fontValue = (key: 'heading' | 'body') => { const slug = effective.value[key]; return slug && BUILTIN_FONT_SLUGS.has(slug) ? slug : '' }
const sampleFamily = (variable: string) => fontVars(effective.value)[variable] ?? 'system-ui, sans-serif'
function font(key: 'heading' | 'body', value: string) {
  if (!selected.value || props.disabled) return
  emit('update:modelValue', withFont(selected.value, key, value || null))
}
function choose(value: unknown) {
  if (props.disabled) return
  emit('update:modelValue', value === 'inherit' ? null : value === 'bare' ? 'bare' : { ...effective.value, palette: String(value) })
}
function dimension(key: 'mode' | 'style', value: string) {
  if (!selected.value || props.disabled) return
  emit('update:modelValue', { ...selected.value, [key]: value } as ThemeChoice)
}
</script>

<template>
  <div class="theme-picker">
    <fieldset><legend :id="`${id}-palette`">Palette</legend>
      <RadioGroupRoot class="theme-picker__palettes" :aria-labelledby="`${id}-palette`" :model-value="palette" :disabled="disabled" @update:model-value="choose">
        <div v-if="inherit" class="theme-picker__inherit">
          <RadioGroupItem value="inherit" aria-label="Inherit" class="theme-picker__option">Inherit</RadioGroupItem>
          <span class="theme-picker__inherited-palette">{{ inheritedPaletteName }}</span>
          <p v-if="unavailable" class="theme-picker__unavailable">Theme unavailable — inherited</p>
        </div>
        <RadioGroupItem v-if="bare" value="bare" aria-label="No frame" class="theme-picker__option">No frame</RadioGroupItem>
        <RadioGroupItem v-for="item in BUILTIN_PALETTES" :key="item.slug" :value="`builtin:${item.slug}`" :aria-label="item.name" :class="['theme-picker__tile', `widget--theme-${themeKey({ palette: `builtin:${item.slug}`, mode: effective.mode, style: 'solid' }, scheme)}`]">
          <span aria-hidden="true" class="theme-picker__sample"><span class="theme-picker__line">Aa</span><span class="theme-picker__dot" /></span>
          <span>{{ item.name }}</span>
        </RadioGroupItem>
      </RadioGroupRoot>
    </fieldset>
    <fieldset><legend :id="`${id}-mode`">Mode</legend><UiRadioGroup :aria-labelledby="`${id}-mode`" :model-value="effective.mode" :options="modes" :disabled="dimensionsDisabled" @update:model-value="dimension('mode', $event)" /></fieldset>
    <fieldset><legend :id="`${id}-style`">Style</legend><UiRadioGroup :aria-labelledby="`${id}-style`" :model-value="effective.style" :options="styles" :disabled="dimensionsDisabled" @update:model-value="dimension('style', $event)" /></fieldset>
    <div v-for="row in fontRows" :key="row.key" class="theme-picker__font">
      <label :for="`${id}-${row.key}`">{{ row.label }}</label>
      <UiSelect :id="`${id}-${row.key}`" :model-value="fontValue(row.key)" :options="fontOptions" :disabled="dimensionsDisabled" @update:model-value="font(row.key, $event)" />
    </div>
    <div class="theme-picker__font-sample" aria-hidden="true">
      <p :style="{ fontFamily: sampleFamily('--ld-font-heading') }">Heading Заголовок</p>
      <p :style="{ fontFamily: sampleFamily('--ld-font-body') }">Body text Текст 123</p>
    </div>
  </div>
</template>

<style>
.theme-picker { display: grid; gap: 1rem; }
.theme-picker fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.theme-picker legend { margin-bottom: 0.5rem; color: var(--ld-text-primary); }
/* At most four columns; narrow panels keep the readable minimum tile width. */
.theme-picker__palettes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, max(6rem, (100% - 1.5rem) / 4)), 1fr)); gap: 0.5rem; }
.theme-picker__tile { overflow-wrap: anywhere; }
.theme-picker__tile, .theme-picker__option { padding: 0.5rem; border: 1px solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-bg); color: var(--ld-text-primary); cursor: pointer; }
.theme-picker__tile[data-state="checked"], .theme-picker__option[data-state="checked"] { outline: 2px solid var(--ld-accent); outline-offset: 2px; }
.theme-picker__tile:focus-visible, .theme-picker__option:focus-visible { outline: 2px solid var(--ld-focus-ring); outline-offset: 2px; }
.theme-picker__tile[data-disabled], .theme-picker__option[data-disabled] { opacity: 0.6; cursor: default; }
.theme-picker__sample { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
.theme-picker__line { color: var(--ld-text-primary); }
.theme-picker__dot { width: 0.75rem; height: 0.75rem; border-radius: 50%; background: var(--ld-accent); }
.theme-picker__font { display: grid; gap: 0.375rem; }
.theme-picker__font label { color: var(--ld-text-primary); }
.theme-picker__font-sample p { margin: 0; color: var(--ld-text-primary); }
.theme-picker__inherit { grid-column: 1 / -1; }
.theme-picker__inherited-palette { margin-left: 0.5rem; color: var(--ld-text-secondary); font-size: 0.875rem; }
.theme-picker__unavailable { margin: 0.375rem 0 0; color: var(--ld-text-secondary); font-size: 0.875rem; }
</style>
