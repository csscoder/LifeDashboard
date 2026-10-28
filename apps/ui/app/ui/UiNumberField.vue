<script setup lang="ts">
import { useFieldBridge } from './field-bridge'
import { computed, ref } from 'vue'
import { NumberFieldRoot, NumberFieldInput } from 'reka-ui'
import { numberFormatOptions } from './number-format'
defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue: number; integer: boolean; min?: number; max?: number; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const { control, disabled, bindings } = useFieldBridge(props)
// Integer schemas can have fractional bounds. Reka anchors its step grid at min.
const minimum = computed(() => props.integer && props.min !== undefined ? Math.ceil(props.min) : props.min)
const maximum = computed(() => props.integer && props.max !== undefined ? Math.floor(props.max) : props.max)
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
  <NumberFieldRoot :key="revision" :model-value="modelValue" :step="integer ? 1 : undefined" :step-snapping="integer" :format-options="numberFormatOptions(integer)" :min="minimum" :max="maximum" :disabled="disabled" @update:model-value="update">
    <NumberFieldInput ref="control" v-bind="bindings()" class="ui-number-field" />
  </NumberFieldRoot>
</template>

<style>
.ui-number-field { width: 100%; box-sizing: border-box; padding: 0.5rem 0.625rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); color: var(--ld-text-primary); font: inherit; }
.ui-number-field:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-number-field:disabled, .ui-number-field[data-disabled] { opacity: 0.6; }
</style>
