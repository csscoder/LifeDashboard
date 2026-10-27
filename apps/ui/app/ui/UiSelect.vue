<script setup lang="ts">
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { ref, useTemplateRef, watch } from 'vue'

// A themed select. Attributes (id, aria-*) go to the trigger, so a <label for> names it. The list renders
// in place, not in body: the panels that use it sit in the top layer, above anything portalled to body.
// One root element: reka-ui leaves an empty placeholder for the closed list, which a parent grid would
// otherwise place in a cell of its own, so the rows below would jump when the list opens.
defineOptions({ inheritAttrs: false })
const props = defineProps<{
  modelValue: string
  options: readonly { value: string; label: string }[]
  disabled?: boolean
  // Shown while the value is '' and no option means '' (an action picker such as «Add widget…»).
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// reka-ui reserves '' to clear the selection; an option may still mean '' (the «Same as board» style).
const EMPTY = '\u0000empty'
const toItem = (value: string) => (value === '' && props.options.some((option) => option.value === '') ? EMPTY : value)
const fromItem = (value: unknown) => (value === EMPTY ? '' : String(value))

const open = ref(false)
const trigger = useTemplateRef<{ $el: Element }>('trigger')
// A panel that closes without user input (WidgetBoard closes it on resize) would leave the list open in a hidden
// popover, with reka-ui still blocking pointer events on the page; the list closes with its popover.
watch(open, (isOpen, _old, onCleanup) => {
  const popover = isOpen ? trigger.value?.$el.closest('[popover]') : null
  if (!popover) return
  const onToggle = (event: Event) => {
    if ((event as ToggleEvent).newState === 'closed') open.value = false
  }
  popover.addEventListener('toggle', onToggle)
  onCleanup(() => popover.removeEventListener('toggle', onToggle))
})
// reka-ui leaves Escape uncancelled, so a surrounding popover would close too; cancel it and close the list here.
function onEscape(event: KeyboardEvent) {
  event.preventDefault()
  open.value = false
}
</script>

<template>
  <div class="ui-select-field">
    <SelectRoot v-model:open="open" :model-value="toItem(modelValue)" :disabled="disabled" @update:model-value="emit('update:modelValue', fromItem($event))">
      <SelectTrigger ref="trigger" v-bind="$attrs" class="ui-select">
        <SelectValue class="ui-select__value" :placeholder="placeholder" />
        <SelectIcon class="ui-select__icon">
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </SelectIcon>
      </SelectTrigger>
      <SelectPortal :disabled="true">
        <SelectContent position="popper" :side-offset="4" class="ui-select__content" @escape-key-down="onEscape">
          <SelectViewport class="ui-select__viewport">
            <SelectItem v-for="option in options" :key="option.value" :value="toItem(option.value)" class="ui-select__item">
              <SelectItemText>{{ option.label }}</SelectItemText>
              <SelectItemIndicator class="ui-select__check" aria-hidden="true">✓</SelectItemIndicator>
            </SelectItem>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </div>
</template>

<!-- Not scoped: reka-ui puts the classes on elements inside its components, which scoped styles do not reach. -->
<style>
.ui-select-field {
  min-width: 0;
}

.ui-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.375rem;
  width: 100%;
  min-width: 0;
  height: 1.75rem;
  padding: 0 0.5rem;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: var(--ld-radius-control);
  background: var(--ld-surface-3);
  color: var(--ld-text-primary);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.ui-select:hover {
  border-color: var(--ld-border-strong);
}

.ui-select:focus-visible {
  outline: 0.125rem solid var(--ld-focus-ring);
  outline-offset: 0.125rem;
}

.ui-select[data-disabled] {
  cursor: default;
  opacity: 0.6;
}

.ui-select__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-select__icon {
  display: flex;
  flex: none;
  color: var(--ld-text-secondary);
}

.ui-select__content {
  z-index: 1;
  min-width: var(--reka-select-trigger-width);
  max-height: min(18rem, var(--reka-select-content-available-height));
  overflow: hidden;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: var(--ld-radius-control);
  background: var(--ld-surface-2);
  color: var(--ld-text-primary);
  box-shadow: var(--ld-shadow-raised, none);
}

.ui-select__viewport {
  padding: 0.25rem;
}

.ui-select__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--ld-radius-control);
  outline: none;
  cursor: pointer;
  user-select: none;
}

.ui-select__item[data-highlighted] {
  background: var(--ld-state-hover);
}

.ui-select__item[data-state='checked'] {
  background: var(--ld-state-selected);
}

.ui-select__check {
  color: var(--ld-accent-text);
}
</style>
