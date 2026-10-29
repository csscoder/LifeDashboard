<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { useFieldBridge } from './field-bridge'
import {
  ColorAreaArea, ColorAreaRoot, ColorAreaThumb, ColorFieldInput, ColorFieldRoot, ColorSliderRoot, ColorSliderThumb, ColorSliderTrack,
  ColorSwatch, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger, type Color,
} from 'reka-ui'
defineOptions({ inheritAttrs: false })
// alpha (0..1) is optional and separate from the #rrggbb model; it adds the opacity slider.
const props = defineProps<{ modelValue: string; alpha?: number; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:alpha': [value: number] }>()
const { control, disabled, bindings } = useFieldBridge(props)
let rawText: string | undefined
function recordInput(event: Event) {
  rawText = (event.target as HTMLInputElement).value
}
function recordStep(event: KeyboardEvent | WheelEvent) {
  // Stepping uses the current model, not the uncommitted text (including rejected alpha).
  if ('deltaY' in event || ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) rawText = undefined
}
function update(value: string | null) {
  const typed = rawText
  rawText = undefined
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) && (typed === undefined || /^#?[0-9a-f]{6}$/i.test(typed.trim()))) emit('update:modelValue', value.toLowerCase())
}

// The picker opens as a child of the nearest popover panel (it must stay in that top layer), not inside the
// panel's scroller, which would clip it; outside any popover it goes to the body.
const root = useTemplateRef<HTMLElement>('root')
const portalTarget = shallowRef<HTMLElement | string>('body')
function onOpen(open: boolean) {
  if (open) portalTarget.value = root.value?.closest<HTMLElement>('[popover]') ?? 'body'
}

// The picker keeps its own HSB colour: a hex round trip loses the hue of grey and black.
const picked = shallowRef<string | Color>(props.modelValue)
let emitted: string | undefined
watch(() => props.modelValue, (value) => { if (value !== emitted) picked.value = value })
const withAlpha = (hex: string) => props.alpha === undefined || props.alpha >= 1 ? hex : hex + Math.round(props.alpha * 255).toString(16).padStart(2, '0')
const swatch = computed(() => withAlpha(props.modelValue))
// The prop owns the alpha; the picker's own colour keeps hue and saturation.
const pickerColor = computed(() => typeof picked.value === 'string' ? withAlpha(picked.value) : { ...picked.value, alpha: props.alpha ?? 1 })
function pick(value: string | Color) {
  // Reka adds an alpha pair while the opacity is below 1; the model keeps #rrggbb.
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return
  emitted = value.slice(0, 7).toLowerCase()
  if (emitted !== props.modelValue) emit('update:modelValue', emitted)
}
function pickAlpha(color: Color) {
  picked.value = color
  emit('update:alpha', Math.round(color.alpha * 100) / 100)
}
</script>

<template>
  <div ref="root" class="ui-color">
    <PopoverRoot @update:open="onOpen">
      <PopoverTrigger class="ui-color__trigger" aria-label="Pick color" :disabled="disabled">
        <ColorSwatch class="ui-color__swatch" :color="swatch" />
      </PopoverTrigger>
      <PopoverPortal :to="portalTarget">
      <PopoverContent class="ui-color__picker" side="bottom" align="start" :side-offset="4">
        <ColorAreaRoot class="ui-color__area" :model-value="pickerColor" color-space="hsb" x-channel="saturation" y-channel="brightness" @update:model-value="pick" @update:color="picked = $event" v-slot="{ style }">
          <ColorAreaArea class="ui-color__area-plane" :style="style"><ColorAreaThumb class="ui-color__thumb" /></ColorAreaArea>
        </ColorAreaRoot>
        <ColorSliderRoot class="ui-color__hue" :model-value="pickerColor" color-space="hsb" channel="hue" @update:model-value="pick" @update:color="picked = $event">
          <ColorSliderTrack class="ui-color__hue-track" />
          <ColorSliderThumb class="ui-color__thumb" aria-label="Hue" />
        </ColorSliderRoot>
        <ColorSliderRoot v-if="alpha !== undefined" class="ui-color__hue" :model-value="pickerColor" color-space="hsb" channel="alpha" @update:color="pickAlpha">
          <ColorSliderTrack class="ui-color__hue-track" />
          <ColorSliderThumb class="ui-color__thumb" aria-label="Opacity" />
        </ColorSliderRoot>
      </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
    <ColorFieldRoot :model-value="modelValue" :disabled="disabled" @update:model-value="update">
      <ColorFieldInput ref="control" v-bind="bindings()" class="ui-color-field" @input.capture="recordInput" @keydown.capture="recordStep" @wheel.capture="recordStep" />
    </ColorFieldRoot>
  </div>
</template>

<style>
.ui-color { display: flex; gap: 0.5rem; align-items: stretch; }
.ui-color > :last-child { flex: 1; min-width: 0; }
.ui-color__trigger { flex: none; width: 2.25rem; padding: 0.1875rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); cursor: pointer; }
/* A black and white checkerboard shows through a transparent colour; white and black are not theme colours here. */
.ui-color__swatch { background: linear-gradient(var(--reka-color-swatch-color), var(--reka-color-swatch-color)), repeating-conic-gradient(#fff 0 25%, #000 0 50%) 0 0 / 0.5rem 0.5rem; }
.ui-color__trigger:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-color__trigger:disabled { opacity: 0.6; cursor: default; }
.ui-color__swatch { display: block; width: 100%; height: 100%; border-radius: calc(var(--ld-radius-control) / 2); }
.ui-color__picker { z-index: 1; display: grid; gap: 0.75rem; width: 15rem; padding: 0.75rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-card); background: var(--ld-surface-1-solid); box-shadow: var(--ld-shadow-raised, none); }
.ui-color__area-plane { position: relative; height: 9rem; border-radius: var(--ld-radius-control); touch-action: none; }
.ui-color__hue { position: relative; display: flex; align-items: center; height: 1rem; touch-action: none; }
.ui-color__hue-track { position: relative; flex: 1; height: 0.625rem; border-radius: 999px; }
.ui-color__thumb { display: block; width: 1rem; height: 1rem; border: 0.125rem solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4); }
.ui-color__thumb:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-color-field { width: 100%; box-sizing: border-box; padding: 0.5rem 0.625rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); color: var(--ld-text-primary); font: inherit; }
.ui-color-field:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-color-field:disabled, .ui-color-field[data-disabled] { opacity: 0.6; }
</style>
