<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { FieldRoot } from 'reka-ui'
import type { FocusSession } from '@lifedashboard/contracts/focus'
import { SPACE_COLORS, type SpaceColor } from '@lifedashboard/contracts/space'
import { api } from '../../../api'
import { dayKey } from '../../../focus/engine'
import { focusStore } from '../../../focus/store'
import UiButton from '../../../ui/UiButton.vue'
import UiTextField from '../../../ui/UiTextField.vue'
import { anchoredBox } from '../../widget-anchor'
import { focusHours, lastDays, projectShares, todaySessions, weekBars } from './stats'

const open = defineModel<boolean>('open', { required: true })

const TABS = ['Today', 'Week', 'Projects'] as const
const MONTH = 30
const state = focusStore.state
const dialog = useTemplateRef<HTMLDialogElement>('dialogBox')
const tab = ref<(typeof TABS)[number]>('Today')
const range = ref<'Week' | 'Month'>('Week')
const sessions = ref<FocusSession[]>([])
const failed = ref(false)
const today = ref(dayKey(Date.now()))
// Per-project rejection text from updateProject.
const errors = ref<Record<string, string>>({})

const dayList = computed(() => lastDays(today.value, range.value === 'Week' ? 7 : MONTH))
const bars = computed(() => weekBars(sessions.value, today.value, state.settings.dailyGoal))
const barMax = computed(() => Math.max(state.settings.dailyGoal, ...bars.value.map(({ pomodoros }) => pomodoros)))
const weekSessions = computed(() => sessions.value.filter(({ day }) => lastDays(today.value, 7).includes(day)))
const shares = computed(() => projectShares(sessions.value.filter(({ day }) => dayList.value.includes(day)), state.projects))
const shareMax = computed(() => Math.max(1, ...shares.value.map(({ minutes }) => minutes)))
const todays = computed(() => todaySessions(sessions.value, today.value))

const hue = (color: SpaceColor | null) => (color ? `oklch(0.7 0.15 ${SPACE_COLORS[color]})` : 'var(--ld-text-muted)')
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const projectOf = (id: string | null) => state.projects.find((project) => project.id === id)

// Bumped by every load: an older answer is ignored.
let request = 0
async function load() {
  const mine = ++request
  failed.value = false
  today.value = dayKey(Date.now())
  const result = await api.focusSessions(lastDays(today.value, MONTH)[0]!, today.value)
  if (mine !== request) return
  if (result.ok) sessions.value = result.data
  else failed.value = true
}

// Centred on the widget card, at most 20 % larger; the window resizes the grid, so it follows.
const place = ref<Record<string, string>>({})
function anchor() {
  const card = dialog.value?.closest('.widget')?.getBoundingClientRect()
  if (!card) return
  const box = anchoredBox(card, { width: window.innerWidth, height: window.innerHeight }, 16)
  place.value = { '--x': `${box.x}px`, '--y': `${box.y}px`, '--max-w': `${box.maxWidth}px`, '--max-h': `${box.maxHeight}px` }
}
onMounted(() => window.addEventListener('resize', anchor))
onUnmounted(() => window.removeEventListener('resize', anchor))

async function patch(id: string, change: { name?: string; color?: SpaceColor; archived?: boolean }) {
  const result = await focusStore.updateProject(id, change)
  errors.value = { ...errors.value, [id]: result.ok ? '' : result.error }
}

watch(
  open,
  (value) => {
    if (!value) return dialog.value?.close()
    tab.value = 'Today'
    errors.value = {}
    void load()
    anchor()
    dialog.value?.showModal()
  },
  { flush: 'post' },
)
</script>

<template>
  <dialog ref="dialogBox" class="focus-stats" :style="place" aria-labelledby="focus-stats-title" @close="open = false">
    <h2 id="focus-stats-title" class="focus-stats__title">Statistics</h2>
    <div class="focus-stats__tabs" role="group" aria-label="Period">
      <button v-for="name in TABS" :key="name" type="button" :aria-pressed="tab === name" @click="tab = name">{{ name }}</button>
    </div>

    <div v-if="failed" class="focus-stats__error" role="alert">
      <p>Can't load statistics</p>
      <UiButton @click="load">Retry</UiButton>
    </div>

    <template v-else>
      <ul v-if="tab === 'Today'" class="focus-stats__list">
        <li v-if="!todays.length" class="focus-stats__muted">No sessions today</li>
        <li v-for="item in todays" :key="item.id" class="focus-stats__session">
          <span class="focus-stats__time">{{ clock(item.startedAt) }}–{{ clock(item.endedAt) }}</span>
          <span class="focus-stats__clip">{{ item.label || 'No task' }}</span>
          <span class="focus-stats__project-tag">
            <i :style="{ background: hue(projectOf(item.projectId)?.color ?? null) }" /><span class="focus-stats__clip">{{ projectOf(item.projectId)?.name ?? 'No project' }}</span>
          </span>
          <span class="focus-stats__muted">{{ Math.round(item.focusMs / 60_000) }} min</span>
          <span :aria-label="item.completed ? 'Completed' : 'Interrupted'" :title="item.completed ? 'Completed' : 'Interrupted'">{{ item.completed ? '✓' : '✗' }}</span>
        </li>
      </ul>

      <div v-else-if="tab === 'Week'">
        <p class="focus-stats__muted">{{ focusHours(weekSessions) }} h focused</p>
        <div class="focus-stats__bars" role="img" :aria-label="`Pomodoros per day against a goal of ${state.settings.dailyGoal}: ${bars.map((bar) => bar.pomodoros).join(', ')}`">
          <div v-for="bar in bars" :key="bar.day" class="focus-stats__bar">
            <span class="focus-stats__plot">
              <span class="focus-stats__goal-line" :style="{ bottom: `${(bar.goal / barMax) * 100}%` }" />
              <span class="focus-stats__column" :class="{ 'focus-stats__column--goal': bar.pomodoros >= bar.goal }" :style="{ height: `${(bar.pomodoros / barMax) * 100}%` }" />
            </span>
            <span class="focus-stats__muted">{{ bar.pomodoros }} / {{ bar.goal }}</span>
            <span class="focus-stats__muted">{{ bar.day.slice(5) }}</span>
          </div>
        </div>
      </div>

      <div v-else>
        <div class="focus-stats__tabs" role="group" aria-label="Range">
          <button v-for="name in ['Week', 'Month'] as const" :key="name" type="button" :aria-pressed="range === name" @click="range = name">{{ name }}</button>
        </div>
        <ul class="focus-stats__list">
          <li v-if="!shares.length" class="focus-stats__muted">No focus time</li>
          <li v-for="share in shares" :key="share.projectId ?? ''" class="focus-stats__share">
            <span>{{ share.name }}</span>
            <span class="focus-stats__track"><i :style="{ width: `${(share.minutes / shareMax) * 100}%`, background: hue(share.color) }" /></span>
            <span class="focus-stats__muted">{{ share.minutes }} min</span>
          </li>
        </ul>

        <h3 class="focus-stats__subtitle">Projects</h3>
        <ul class="focus-stats__list">
          <li v-for="project in state.projects" :key="project.id" class="focus-stats__project" :class="{ 'focus-stats__project--archived': project.archivedAt !== null }">
            <FieldRoot><UiTextField :model-value="project.name" :aria-label="`Name of ${project.name}`" :maxlength="40" @change="patch(project.id, { name: ($event.target as HTMLInputElement).value.trim() })" /></FieldRoot>
            <span class="focus-stats__colors" role="group" :aria-label="`Colour of ${project.name}`">
              <button
                v-for="(value, key) in SPACE_COLORS"
                :key="key"
                type="button"
                class="focus-stats__swatch"
                :style="{ background: `oklch(0.7 0.15 ${value})` }"
                :aria-label="key"
                :aria-pressed="project.color === key"
                @click="patch(project.id, { color: key })"
              />
            </span>
            <UiButton @click="patch(project.id, { archived: project.archivedAt === null })">{{ project.archivedAt === null ? 'Archive' : 'Restore' }}</UiButton>
            <p v-if="errors[project.id]" class="focus-stats__problem" role="alert">{{ errors[project.id] }}</p>
          </li>
        </ul>
      </div>
    </template>

    <div class="focus-stats__footer"><UiButton @click="open = false">Close</UiButton></div>
  </dialog>
</template>

<style scoped>
.focus-stats {
  position: fixed;
  inset: auto;
  left: var(--x, 50%);
  top: var(--y, 50%);
  translate: -50% -50%;
  box-sizing: border-box;
  width: min(34rem, var(--max-w, calc(100vw - 2rem)));
  max-width: none;
  max-height: var(--max-h, calc(100vh - 2rem));
  overflow: auto;
  padding: 1.5rem;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: var(--ld-radius-card);
  background: var(--ld-surface-1-solid);
  color: var(--ld-text-primary);
  font-family: var(--ld-font-ui);
  margin: 0;
  font-size: 1rem; /* rendered inside the widget body: never follow its text size setting */
}
.focus-stats::backdrop { background: var(--ld-scrim); }
.focus-stats__title { margin: 0 0 1rem; font-size: 1.125rem; }
.focus-stats__subtitle { margin: 1rem 0 0.5rem; font-size: 1rem; }
.focus-stats__tabs { display: flex; gap: 0.25rem; margin-bottom: 0.75rem; }
.focus-stats__tabs button { padding: 0.25rem 0.75rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); color: var(--ld-text-primary); font: inherit; cursor: pointer; }
.focus-stats__tabs button[aria-pressed='true'] { border-color: var(--ld-focus-ring); }
.focus-stats button:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.focus-stats__list { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.focus-stats__list li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.focus-stats__list .focus-stats__session { display: grid; grid-template-columns: max-content minmax(0, 1fr) minmax(0, max-content) max-content max-content; }
.focus-stats__clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.focus-stats__muted { color: var(--ld-text-muted); font-size: 0.8125rem; }
.focus-stats__time { font-variant-numeric: tabular-nums; }
.focus-stats__bars { display: flex; align-items: flex-end; gap: 0.5rem; }
.focus-stats__bar { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: flex-end; gap: 0.125rem; }
.focus-stats__plot { position: relative; display: flex; align-items: flex-end; width: 100%; height: 7rem; }
.focus-stats__goal-line { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--ld-text-muted); }
.focus-stats__project-tag { display: inline-flex; min-width: 0; align-items: center; gap: 0.375rem; color: var(--ld-text-secondary); font-size: 0.8125rem; }
.focus-stats__project-tag i { flex: none; width: 0.5rem; height: 0.5rem; border-radius: 50%; }
.focus-stats__column { width: 100%; min-height: 1px; border-radius: 0.125rem; background: oklch(0.64 0.22 27); }
.focus-stats__column--goal { background: oklch(0.82 0.15 85); }
.focus-stats__share > :first-child { width: 8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.focus-stats__track { flex: 1; height: 0.5rem; border-radius: 0.25rem; background: var(--ld-border-subtle); overflow: hidden; }
.focus-stats__track i { display: block; height: 100%; }
.focus-stats__project--archived { opacity: 0.6; }
.focus-stats__colors { display: flex; gap: 0.25rem; }
.focus-stats__swatch { width: 1.25rem; height: 1.25rem; border: 0; border-radius: 50%; cursor: pointer; }
.focus-stats__swatch[aria-pressed='true'] { outline: 0.125rem solid var(--ld-text-primary); outline-offset: 0.125rem; }
.focus-stats__problem { flex-basis: 100%; margin: 0; color: var(--ld-danger-text); font-size: 0.8125rem; }
.focus-stats__error { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; color: var(--ld-text-secondary); }
.focus-stats__footer { display: flex; justify-content: flex-end; margin-top: 1rem; }
</style>
