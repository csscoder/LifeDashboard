<script setup lang="ts">
import { Primitive } from 'reka-ui'
defineOptions({ inheritAttrs: false })
defineProps<{ disabled?: boolean }>()
</script>

<template>
  <Primitive v-bind="$attrs" as="button" type="button" class="ui-button" :disabled="disabled"><slot /></Primitive>
</template>

<style>
.ui-button { display: inline-flex; align-items: center; justify-content: center; height: 1.75rem; padding: 0 0.5rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); color: var(--ld-text-primary); font: inherit; cursor: pointer; }
.ui-button:hover { border-color: var(--ld-border-strong); }
.ui-button:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.ui-button:disabled { opacity: 0.6; cursor: default; }
</style>
