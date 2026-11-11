<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef, watch } from 'vue'
import {
  ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxPortal, ComboboxRoot, ComboboxTrigger, ComboboxViewport,
  FieldRoot, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger,
} from 'reka-ui'
import { nextColor, SPACE_COLORS, type SpaceColor } from '@lifedashboard/contracts/space'
import UiButton from '../../../ui/UiButton.vue'
import UiSelect from '../../../ui/UiSelect.vue'
import UiTextField from '../../../ui/UiTextField.vue'
import type { FocusStore } from '../../../focus/store'
import { taskSuggestions } from './view'

// The trigger (the label line) comes in the default slot. The form edits a draft; only Save applies it (setTask), and a
// change during a running focus applies to the current session.
const props = defineProps<{ store: FocusStore }>()
const emit = defineEmits<{ close: [] }>()

const state = props.store.state
const open = ref(false)
const draft = ref(state.run.label ?? '')
const project = ref(state.run.projectId)
// What the user typed since opening; the list searches only after typing.
const typed = ref('')
const labelError = ref('')
const adding = ref(false)
const projectName = ref('')
const projectError = ref('')
const picked = ref<SpaceColor | null>(null)
const busy = ref(false)
// WebKit marks the focus Reka hands back to the trigger as visible even after a mouse click, which keeps the widget's
// corner buttons up; a mouse Save leaves the focus where it falls.
let pointerSave = false

// The content opens in the space, like UiColorField picks its target: the body lacks the theme tokens, and every
// tile card is a stacking context, so in the tile it would sit under later tiles. Outside a space it goes to the body.
const trigger = useTemplateRef<{ $el: HTMLElement }>('trigger')
const portalTarget = shallowRef<HTMLElement | string>('body')

const projects = computed(() => state.projects.filter(({ archivedAt }) => archivedAt === null))
const color = computed(() => picked.value ?? nextColor(projects.value.map((project) => project.color)))
const options = computed(() => [{ value: '', label: 'No project' }, ...projects.value.map(({ id, name }) => ({ value: id, label: name }))])
const label = computed(() => draft.value.trim() || null)
const suggestions = computed(() => taskSuggestions(state.recentLabels, typed.value, state.run.label ?? ''))
// Reka highlights the first item on input, before the new list renders; highlight it again once it has.
const combobox = useTemplateRef<{ highlightFirstItem?: () => void }>('combobox')
const taskInput = useTemplateRef<{ $el?: HTMLElement }>('taskInput')
watch(suggestions, () => combobox.value?.highlightFirstItem?.(), { flush: 'post' })

function onOpen(next: boolean) {
  open.value = next
  if (next) {
    portalTarget.value = trigger.value?.$el.closest<HTMLElement>('.space') ?? 'body'
    draft.value = state.run.label ?? ''
    project.value = state.run.projectId
    pointerSave = false
    typed.value = ''
    labelError.value = projectError.value = projectName.value = ''
    adding.value = false
    picked.value = null
  } else emit('close')
}
function pick(value: string) {
  draft.value = value
  typed.value = ''
}
function clearTask() {
  draft.value = typed.value = ''
  taskInput.value?.$el?.focus()
}
function clear() {
  draft.value = typed.value = labelError.value = ''
  project.value = null
}
/** Applies the draft; a rejection stays visible and keeps the picker open. A project still being created is not in it yet. */
function save(event?: MouseEvent) {
  if (busy.value) return
  labelError.value = props.store.setTask(label.value, project.value) ?? ''
  if (labelError.value) return
  pointerSave = (event?.detail ?? 0) > 0
  onOpen(false)
}
// Projects can only be archived, so a second request (double click, Enter then click, retry) would be a permanent duplicate.
async function addProject() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await props.store.createProject(projectName.value.trim(), color.value)
    if (!result.ok) {
      projectError.value = result.error
      return
    }
    adding.value = false
    projectName.value = ''
    project.value = result.project.id
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PopoverRoot :open="open" @update:open="onOpen">
    <PopoverTrigger ref="trigger" as-child><slot /></PopoverTrigger>
    <PopoverPortal :to="portalTarget">
      <PopoverContent class="task-picker" side="top" :side-offset="6" aria-label="Task" @close-auto-focus="pointerSave && $event.preventDefault()">
        <!-- The typed text is free: the list only suggests. Its first item is the typed text, so Enter on the highlighted
             item keeps it; an Enter Reka does not take (nothing highlighted) bubbles to the anchor and saves. -->
        <ComboboxRoot ref="combobox" ignore-filter open-on-focus open-on-click :reset-search-term-on-blur="false" :reset-search-term-on-select="false" @update:model-value="pick(String($event))">
          <ComboboxAnchor class="task-picker__field" @keydown.enter.prevent="save()">
            <ComboboxInput ref="taskInput" :model-value="draft" class="ui-text-field" aria-label="Task" placeholder="What are you working on?" :maxlength="120" @update:model-value="draft = typed = $event" />
            <!-- tabindex -1 like Reka's own clear button: the keyboard empties the field by itself. -->
            <button v-if="draft" type="button" class="task-picker__icon" aria-label="Clear task" tabindex="-1" @click="clearTask">×</button>
            <ComboboxTrigger class="task-picker__icon" aria-label="Show recent tasks">
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </ComboboxTrigger>
          </ComboboxAnchor>
          <ComboboxPortal :to="portalTarget">
            <ComboboxContent class="task-picker__list" position="popper" :side-offset="4" hide-when-empty>
              <ComboboxViewport>
                <ComboboxItem v-for="item in suggestions" :key="item" :value="item" class="task-picker__option">{{ item }}</ComboboxItem>
              </ComboboxViewport>
            </ComboboxContent>
          </ComboboxPortal>
        </ComboboxRoot>
        <p v-if="labelError" class="task-picker__error" role="alert">{{ labelError }}</p>

        <UiSelect aria-label="Project" :model-value="project ?? ''" :options="options" @update:model-value="project = $event || null" />

        <UiButton v-if="!adding" @click="adding = true">+ New project</UiButton>
        <div v-else class="task-picker__new">
          <FieldRoot><UiTextField v-model="projectName" aria-label="Project name" placeholder="Project name" :maxlength="40" @keydown.enter.prevent="projectName.trim() && addProject()" /></FieldRoot>
          <div class="task-picker__colors" role="group" aria-label="Project colour">
            <button
              v-for="(hue, key) in SPACE_COLORS"
              :key="key"
              type="button"
              class="task-picker__swatch"
              :style="{ background: `oklch(0.7 0.15 ${hue})` }"
              :aria-label="key"
              :aria-pressed="color === key"
              @click="picked = key"
            />
          </div>
          <p v-if="projectError" class="task-picker__error" role="alert">{{ projectError }}</p>
          <UiButton :disabled="busy || !projectName.trim()" @click="addProject">Add</UiButton>
        </div>

        <div class="task-picker__footer">
          <UiButton @click="clear">Clear</UiButton>
          <UiButton :disabled="busy" @click="save">Save</UiButton>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
.task-picker { display: flex; flex-direction: column; gap: 0.5rem; width: 16rem; padding: 0.75rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-2); color: var(--ld-text-primary); z-index: 10; }
.task-picker__colors { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.task-picker__field { position: relative; display: flex; align-items: center; }
.task-picker__field .ui-text-field { flex: 1; min-width: 0; padding-inline-end: 1.75rem; }
.task-picker__field:has(.task-picker__icon + .task-picker__icon) .ui-text-field { padding-inline-end: 3rem; }
.task-picker__field .task-picker__icon:last-child { right: 0.25rem; }
.task-picker__icon { position: absolute; right: 1.625rem; display: inline-flex; align-items: center; justify-content: center; width: 1.375rem; height: 1.375rem; padding: 0; border: 0; border-radius: var(--ld-radius-control); background: none; color: var(--ld-text-secondary); font: inherit; cursor: pointer; }
.task-picker__icon:hover { color: var(--ld-text-primary); background: var(--ld-surface-3); }
.task-picker__footer { display: flex; gap: 0.5rem; }
.task-picker__footer > * { flex: 1; }
.task-picker__list { box-sizing: border-box; width: var(--reka-combobox-trigger-width); max-height: min(16rem, var(--reka-combobox-content-available-height)); overflow-y: auto; padding: 0.25rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-2); color: var(--ld-text-primary); box-shadow: var(--ld-shadow-raised); z-index: 11; }
.task-picker__option { padding: 0.375rem 0.5rem; border-radius: var(--ld-radius-control); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.task-picker__option[data-highlighted] { background: var(--ld-surface-3); }
.task-picker__new { display: flex; flex-direction: column; gap: 0.5rem; }
.task-picker__error { margin: 0; color: var(--ld-danger-text); font-size: 0.8125rem; }
.task-picker__swatch { width: 1.25rem; height: 1.25rem; border: 0; border-radius: 50%; cursor: pointer; }
.task-picker__swatch[aria-pressed='true'] { outline: 0.125rem solid var(--ld-text-primary); outline-offset: 0.125rem; }
.task-picker__swatch:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
</style>
