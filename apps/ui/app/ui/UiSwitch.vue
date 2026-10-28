<script setup lang="ts">
import { useFieldBridge } from './field-bridge'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue: boolean; disabled?: boolean }>()
const { control, disabled, bindings } = useFieldBridge(props)
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <SwitchRoot ref="control" v-bind="bindings()" class="ui-switch" :model-value="modelValue" :disabled="disabled" @update:model-value="emit('update:modelValue', $event)">
    <SwitchThumb class="ui-switch__thumb" />
  </SwitchRoot>
</template>

<style>
.ui-switch {
  display: inline-flex;
  align-items: center;
  width: 3rem;
  height: 1.75rem;
  padding: 0.1875rem;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: var(--ld-radius-control);
  background: var(--ld-surface-3);
  cursor: pointer;
}
.ui-switch[data-state='checked'] { background: var(--ld-accent); }
.ui-switch__thumb {
  width: 1.125rem;
  height: 1.125rem;
  border-radius: var(--ld-radius-control);
  background: var(--ld-text-primary);
}
.ui-switch[data-state='checked'] .ui-switch__thumb { transform: translateX(1.125rem); }
.ui-switch:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-switch[data-disabled] { opacity: 0.6; cursor: default; }
</style>
