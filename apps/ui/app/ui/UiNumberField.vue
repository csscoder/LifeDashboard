<script setup lang="ts">
import { ref } from 'vue'
import { NumberFieldRoot, NumberFieldInput } from 'reka-ui'
import { numberFormatOptions } from './number-format'
defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue: number; integer: boolean; min?: number; max?: number; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const revision = ref(0)
function update(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (props.integer && !Number.isInteger(value)) || (props.min !== undefined && value < props.min) || (props.max !== undefined && value > props.max)) {
    revision.value++
    return
  }
  emit('update:modelValue', value)
}
</script>

<template>
  <NumberFieldRoot :key="revision" :model-value="modelValue" :step="integer ? 1 : undefined" :step-snapping="integer" :format-options="numberFormatOptions(integer)" :min="min" :max="max" :disabled="disabled" @update:model-value="update">
    <NumberFieldInput v-bind="$attrs" class="ui-number-field" />
  </NumberFieldRoot>
</template>

<style>
.ui-number-field { width: 100%; box-sizing: border-box; padding: 0.5rem 0.625rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); color: var(--ld-text-primary); font: inherit; }
.ui-number-field:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-number-field:disabled, .ui-number-field[data-disabled] { opacity: 0.6; }
</style>
