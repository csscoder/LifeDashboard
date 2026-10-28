<script setup lang="ts">
import { ColorFieldRoot, ColorFieldInput } from 'reka-ui'
defineOptions({ inheritAttrs: false })
defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
let rawText = ''
function recordInput(event: Event) {
  rawText = (event.target as HTMLInputElement).value
}
function update(value: string | null) {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) && /^#?[0-9a-f]{6}$/i.test(rawText.trim())) emit('update:modelValue', value.toLowerCase())
}
</script>

<template>
  <ColorFieldRoot :model-value="modelValue" :disabled="disabled" @update:model-value="update">
    <ColorFieldInput v-bind="$attrs" class="ui-color-field" @input.capture="recordInput" />
  </ColorFieldRoot>
</template>

<style>
.ui-color-field { width: 100%; box-sizing: border-box; padding: 0.5rem 0.625rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); color: var(--ld-text-primary); font: inherit; }
.ui-color-field:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-color-field:disabled, .ui-color-field[data-disabled] { opacity: 0.6; }
</style>
