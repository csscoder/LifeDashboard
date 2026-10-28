<script setup lang="ts">
import { RadioGroupRoot, RadioGroupItem, RadioGroupIndicator } from 'reka-ui'
import { useId } from 'vue'
defineOptions({ inheritAttrs: false })
defineProps<{ modelValue: string; options: readonly { value: string; label: string }[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const id = useId()
</script>

<template>
  <RadioGroupRoot v-bind="$attrs" class="ui-radio-group" :model-value="modelValue" :disabled="disabled" @update:model-value="emit('update:modelValue', String($event))">
    <div v-for="(option, index) in options" :key="option.value" class="ui-radio-group__option">
      <RadioGroupItem :id="`${id}-${index}`" :value="option.value" class="ui-radio-group__item"><RadioGroupIndicator class="ui-radio-group__indicator" /></RadioGroupItem>
      <label :for="`${id}-${index}`">{{ option.label }}</label>
    </div>
  </RadioGroupRoot>
</template>

<style>
.ui-radio-group { display: flex; flex-wrap: wrap; gap: 0.75rem; color: var(--ld-text-primary); }
.ui-radio-group__option { display: flex; align-items: center; gap: 0.375rem; min-height: 1.75rem; }
.ui-radio-group__item { display: flex; align-items: center; justify-content: center; width: 1rem; height: 1rem; padding: 0; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); cursor: pointer; }
.ui-radio-group__indicator { width: 0.5rem; height: 0.5rem; border-radius: inherit; background: var(--ld-accent); }
.ui-radio-group__item:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-radio-group[data-disabled] { opacity: 0.6; }
.ui-radio-group__item[data-disabled] { cursor: default; }
</style>
