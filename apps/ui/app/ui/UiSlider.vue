<script setup lang="ts">
import { useFieldBridge } from './field-bridge'
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ modelValue: number; min: number; max: number; step?: number; disabled?: boolean }>(), { step: 1 })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const { control, disabled, bindings } = useFieldBridge(props)
function update(value: number[] | undefined) {
  if (value?.[0] !== undefined) emit('update:modelValue', value[0])
}
</script>

<template>
  <SliderRoot class="ui-slider" :model-value="[modelValue]" :min="min" :max="max" :step="step" :disabled="disabled" @update:model-value="update">
    <SliderTrack class="ui-slider__track"><SliderRange class="ui-slider__range" /></SliderTrack>
    <SliderThumb ref="control" v-bind="bindings()" class="ui-slider__thumb" />
  </SliderRoot>
</template>

<style>
.ui-slider { position: relative; display: flex; align-items: center; height: 1.75rem; touch-action: none; user-select: none; }
.ui-slider__track { position: relative; flex: 1; height: 0.375rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); }
.ui-slider__range { position: absolute; height: 100%; border-radius: inherit; background: var(--ld-accent); }
.ui-slider__thumb { display: block; width: 1rem; height: 1rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); }
.ui-slider__thumb:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-slider[data-disabled] { opacity: 0.6; }
</style>
