<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef } from 'vue'
import { FieldRoot, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { nextColor, SPACE_COLORS, type SpaceColor } from '@lifedashboard/contracts/space'
import UiButton from '../../../ui/UiButton.vue'
import UiSelect from '../../../ui/UiSelect.vue'
import UiTextField from '../../../ui/UiTextField.vue'
import type { FocusStore } from '../../../focus/store'

// The trigger (the label line) comes in the default slot. A change during a running focus applies to the current session (setTask).
const props = defineProps<{ store: FocusStore }>()
const emit = defineEmits<{ close: [] }>()

const state = props.store.state
const open = ref(false)
const draft = ref('')
const labelError = ref('')
const adding = ref(false)
const projectName = ref('')
const projectError = ref('')
const picked = ref<SpaceColor | null>(null)
const busy = ref(false)

// The content opens in the space, like UiColorField picks its target: the body lacks the theme tokens, and every
// tile card is a stacking context, so in the tile it would sit under later tiles. Outside a space it goes to the body.
const trigger = useTemplateRef<{ $el: Element }>('trigger')
const portalTarget = shallowRef<Element | string>('body')

const projects = computed(() => state.projects.filter(({ archivedAt }) => archivedAt === null))
const color = computed(() => picked.value ?? nextColor(projects.value.map((project) => project.color)))
const options = computed(() => [{ value: '', label: 'No project' }, ...projects.value.map(({ id, name }) => ({ value: id, label: name }))])
const label = computed(() => draft.value.trim() || null)

function onOpen(next: boolean) {
  open.value = next
  if (next) {
    portalTarget.value = trigger.value?.$el.closest('.space') ?? 'body'
    draft.value = state.run.label ?? ''
    labelError.value = projectError.value = projectName.value = ''
    adding.value = false
    picked.value = null
  } else emit('close')
}
/** Applies the task; a rejection stays visible and keeps the picker open. */
function apply(nextLabel: string | null, projectId: string | null) {
  labelError.value = props.store.setTask(nextLabel, projectId) ?? ''
  if (!labelError.value) onOpen(false)
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
    apply(label.value, result.project.id)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PopoverRoot :open="open" @update:open="onOpen">
    <PopoverTrigger ref="trigger" as-child><slot /></PopoverTrigger>
    <PopoverPortal :to="portalTarget">
      <PopoverContent class="task-picker" side="top" :side-offset="6" aria-label="Task">
        <FieldRoot><UiTextField v-model="draft" class="task-picker__label" aria-label="Task" placeholder="What are you working on?" :maxlength="120" @keydown.enter.prevent="apply(label, state.run.projectId)" /></FieldRoot>
        <p v-if="labelError" class="task-picker__error" role="alert">{{ labelError }}</p>

        <div v-if="state.recentLabels.length" class="task-picker__recent">
          <UiButton v-for="recent in state.recentLabels" :key="recent" @click="apply(recent, state.run.projectId)">{{ recent }}</UiButton>
        </div>

        <UiSelect aria-label="Project" :model-value="state.run.projectId ?? ''" :options="options" @update:model-value="apply(label, $event || null)" />

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

        <UiButton @click="apply(null, null)">Clear</UiButton>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
.task-picker { display: flex; flex-direction: column; gap: 0.5rem; width: 16rem; padding: 0.75rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-2); color: var(--ld-text-primary); z-index: 10; }
.task-picker__recent, .task-picker__colors { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.task-picker__new { display: flex; flex-direction: column; gap: 0.5rem; }
.task-picker__error { margin: 0; color: var(--ld-danger-text); font-size: 0.8125rem; }
.task-picker__swatch { width: 1.25rem; height: 1.25rem; border: 0; border-radius: 50%; cursor: pointer; }
.task-picker__swatch[aria-pressed='true'] { outline: 0.125rem solid var(--ld-text-primary); outline-offset: 0.125rem; }
.task-picker__swatch:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
</style>
