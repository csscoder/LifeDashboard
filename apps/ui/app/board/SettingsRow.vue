<script setup lang="ts">
import { FieldRoot, FieldLabel, FieldDescription, FieldError } from 'reka-ui'
withDefaults(defineProps<{ label: string; required?: boolean; description?: string; error?: string | null; value?: string; warning?: boolean; nativeLabel?: boolean }>(), { nativeLabel: true })
</script>

<template>
  <FieldRoot class="settings-row" :invalid="!!error" :required="required">
    <FieldLabel :native-label="nativeLabel" class="settings-row__label">{{ label }}<template v-if="required"> *<span class="settings-row__visually-hidden"> required</span></template></FieldLabel>
    <slot />
    <FieldDescription v-if="value !== undefined" as="output" class="settings-row__value" :class="{ 'settings-row__warning': warning }">{{ value }}</FieldDescription>
    <FieldDescription v-if="description" class="settings-row__description">{{ description }}</FieldDescription>
    <FieldError v-if="error" class="settings-row__error">{{ error }}</FieldError>
  </FieldRoot>
</template>

<style scoped>
.settings-row { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr) auto; align-items: center; gap: 0.5rem; min-height: 1.75rem; }
.settings-row__label, .settings-row__value, .settings-row__description { color: var(--ld-text-secondary); }
.settings-row__description, .settings-row__warning, .settings-row__error { grid-column: 1 / -1; margin: 0.125rem 0 0; font-size: 0.75rem; line-height: 1rem; }
.settings-row__warning, .settings-row__error { color: var(--ld-warning-text); }
.settings-row__value { grid-column: 3; grid-row: 1; font-size: 0.75rem; }
.settings-row__visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
