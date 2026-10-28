<script setup lang="ts">
import { useFieldBridge } from './field-bridge'
import { ColorFieldRoot, ColorFieldInput } from 'reka-ui'
defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
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
</script>

<template>
  <ColorFieldRoot :model-value="modelValue" :disabled="disabled" @update:model-value="update">
    <ColorFieldInput ref="control" v-bind="bindings()" class="ui-color-field" @input.capture="recordInput" @keydown.capture="recordStep" @wheel.capture="recordStep" />
  </ColorFieldRoot>
</template>

<style>
.ui-color-field { width: 100%; box-sizing: border-box; padding: 0.5rem 0.625rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); color: var(--ld-text-primary); font: inherit; }
.ui-color-field:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-color-field:disabled, .ui-color-field[data-disabled] { opacity: 0.6; }
</style>
