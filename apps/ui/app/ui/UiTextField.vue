<script setup lang="ts">
import { FieldControl } from 'reka-ui'
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ modelValue: string; type?: 'text' | 'password'; maxlength?: number; minlength?: number; autocomplete?: string; disabled?: boolean }>(), { type: 'text' })
const emit = defineEmits<{ 'update:modelValue': [value: string]; commit: [value: string] }>()
function input(event: Event) { emit('update:modelValue', (event.target as HTMLInputElement).value) }
function change(event: Event) { emit('commit', (event.target as HTMLInputElement).value) }
</script>

<template>
  <FieldControl v-bind="$attrs" class="ui-text-field" :value="modelValue" :type="type" :maxlength="maxlength" :minlength="minlength" :autocomplete="autocomplete" :disabled="disabled" @input="input" @change="change" />
</template>

<style>
.ui-text-field { width: 100%; box-sizing: border-box; padding: 0.5rem 0.625rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); color: var(--ld-text-primary); font: inherit; }
.ui-text-field:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-text-field:disabled, .ui-text-field[data-disabled] { opacity: 0.6; }
</style>
