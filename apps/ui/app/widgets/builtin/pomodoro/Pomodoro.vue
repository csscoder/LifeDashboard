<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useWidget } from '@lifedashboard/widget-sdk'
import { SPACE_COLORS } from '@lifedashboard/contracts/space'
import { alerts } from '../../../focus/alerts'
import { focusStore, useFocusPresence } from '../../../focus/store'
import tomato from './tomato.webp'
import { formatClock, formatTotal, goalDots, isCompact, remainingMs, ringProgress, ringTone, toggleAction } from './view'

const { context } = useWidget()
useFocusPresence()

const state = focusStore.state
const now = ref(Date.now())
const run = computed(() => state.run)
const clock = computed(() => formatClock(remainingMs(run.value, now.value)))
const progress = computed(() => ringProgress(run.value, now.value))
const tone = computed(() => ringTone(run.value, state.today.count, state.settings.dailyGoal))
const dots = computed(() => goalDots(state.today.count, state.settings.dailyGoal))
const goalMet = computed(() => state.today.count >= state.settings.dailyGoal)
const compact = computed(() => isCompact(context.size))
const project = computed(() => state.projects.find(({ id }) => id === run.value.projectId))
const phaseName = computed(() => (run.value.phase === 'focus' ? 'Focus' : run.value.phase === 'short' ? 'Short break' : 'Long break'))

// The ring redraws only while it moves and someone can see it.
let frame: number | undefined
function tick() {
  now.value = Date.now()
  frame = requestAnimationFrame(tick)
}
function stop() {
  if (frame !== undefined) cancelAnimationFrame(frame)
  frame = undefined
}
watch(
  () => context.visible && run.value.status === 'running',
  (active) => {
    stop()
    if (active) tick()
  },
  { immediate: true },
)
onUnmounted(stop)

/** ▶/⏸, the tomato and Space; prime on the user gesture so the phase-end chime and notification may play. */
async function toggle() {
  if (!state.loaded) return
  const action = toggleAction(run.value)
  if (action !== 'pause') await alerts.prime()
  focusStore[action]()
}

// Only the focused tile itself: inner buttons already activate on Space.
function onKey(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return
  event.preventDefault()
  void toggle()
}
</script>

<template>
  <div
    class="pomodoro"
    :class="[`pomodoro--${tone}`, `pomodoro--${run.status}`, { 'pomodoro--compact': compact }]"
    role="group"
    :aria-label="`Pomodoro, ${phaseName}`"
    tabindex="0"
    @keydown.space="onKey"
  >
    <div v-if="state.loadError" class="pomodoro__error">
      <p>Can't load focus</p>
      <button type="button" class="pomodoro__retry" @click="focusStore.load()">Retry</button>
    </div>

    <template v-else>
      <div v-if="!compact" class="pomodoro__goal">
        <span v-if="goalMet">{{ state.today.count }} / {{ state.settings.dailyGoal }} · {{ formatTotal(state.today.focusMs) }}</span>
        <span v-else-if="'text' in dots">{{ dots.text }}</span>
        <span v-else class="pomodoro__dots" :aria-label="`${dots.done} of ${dots.total} pomodoros today`" role="img">
          <i
            v-for="index in dots.total"
            :key="index"
            class="pomodoro__dot"
            :class="{ 'pomodoro__dot--done': index <= dots.done, 'pomodoro__dot--current': dots.current && index === dots.done + 1 }"
          />
        </span>
      </div>

      <div class="pomodoro__face">
        <svg class="pomodoro__ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="pomodoro__track" cx="50" cy="50" r="46" />
          <!-- v-if: a round cap draws a dot at zero length. -->
          <circle
            v-if="progress > 0"
            class="pomodoro__arc"
            cx="50"
            cy="50"
            r="46"
            pathLength="100"
            stroke-dasharray="100"
            :stroke-dashoffset="100 - progress * 100"
            transform="rotate(-90 50 50)"
          />
        </svg>
        <img class="pomodoro__tomato" :src="tomato" alt="" draggable="false" @click="toggle">
        <div class="pomodoro__center">
          <span class="pomodoro__clock" role="timer" :aria-label="`${phaseName}, ${clock} left`">{{ clock }}</span>
          <button v-if="run.status === 'ready'" type="button" class="pomodoro__play" aria-label="Start" :disabled="!state.loaded" @click="toggle">▶</button>
        </div>
      </div>

      <div v-if="!compact" class="pomodoro__label">
        <i v-if="project" class="pomodoro__project" :style="{ background: `oklch(0.7 0.15 ${SPACE_COLORS[project.color]})` }" :title="project.name" />
        <span :class="{ 'pomodoro__muted': !run.label }">{{ run.label || project?.name || 'No task' }}</span>
      </div>

      <div v-if="run.status !== 'ready'" class="pomodoro__controls">
        <button type="button" :aria-label="run.status === 'running' ? 'Pause' : 'Start'" :disabled="!state.loaded" @click="toggle">{{ run.status === 'running' ? '⏸' : '▶' }}</button>
        <button type="button" aria-label="Skip" :disabled="!state.loaded" @click="focusStore.skip()">⏭</button>
        <button type="button" aria-label="Reset" :disabled="!state.loaded" @click="focusStore.reset()">↺</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pomodoro {
  --tone: oklch(0.64 0.22 27);
  --face: min(100cqw, 74cqh);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2cqmin;
  height: 100%;
  color: var(--ld-text-primary);
  outline: none;
}
.pomodoro:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; border-radius: var(--ld-radius-control); }
.pomodoro--break { --tone: oklch(0.72 0.17 150); }
.pomodoro--goal { --tone: oklch(0.82 0.15 85); }
.pomodoro--compact { --face: min(100cqw, 100cqh); }

.pomodoro__goal { color: var(--ld-text-secondary); font-size: max(0.625rem, 5cqmin); font-variant-numeric: tabular-nums; }
.pomodoro__dots { display: flex; gap: 1.5cqmin; }
.pomodoro__dot { width: 3.5cqmin; height: 3.5cqmin; border-radius: 50%; background: var(--ld-border-default); }
.pomodoro__dot--done { background: var(--tone); }
.pomodoro__dot--current { background: transparent; box-shadow: inset 0 0 0 0.6cqmin var(--tone); }

.pomodoro__face { position: relative; flex: none; width: var(--face); height: var(--face); }
.pomodoro__ring { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.pomodoro__track { fill: none; stroke: var(--ld-border-subtle); stroke-width: 3; }
.pomodoro__arc { fill: none; stroke: var(--tone); stroke-width: 3; stroke-linecap: round; filter: drop-shadow(0 0 1.5px var(--tone)); }
.pomodoro--running .pomodoro__arc { animation: pomodoro-glow 3s ease-in-out infinite; }
.pomodoro--paused .pomodoro__ring { animation: pomodoro-blink 2.4s ease-in-out infinite; }
.pomodoro__tomato { position: absolute; inset: 15%; width: 70%; height: 70%; object-fit: contain; cursor: pointer; user-select: none; }

.pomodoro__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--face) * 0.02);
  padding-top: calc(var(--face) * 0.06);
  pointer-events: none;
}
.pomodoro__clock {
  color: #fff;
  font-family: var(--ld-font-mono);
  font-size: calc(var(--face) * 0.16);
  font-weight: var(--ld-weight-strong);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-shadow: 0 0.05em 0.15em oklch(0.2 0.08 27 / 0.7);
}
.pomodoro__play {
  pointer-events: auto;
  width: calc(var(--face) * 0.14);
  height: calc(var(--face) * 0.14);
  border: 0;
  border-radius: 50%;
  background: oklch(1 0 0 / 0.85);
  color: oklch(0.45 0.18 27);
  font-size: calc(var(--face) * 0.06);
  cursor: pointer;
}

.pomodoro__label { display: flex; align-items: center; gap: 1.5cqmin; max-width: 100%; color: var(--ld-text-primary); font-size: max(0.625rem, 5cqmin); }
.pomodoro__label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pomodoro__project { flex: none; width: 3cqmin; height: 3cqmin; border-radius: 50%; }
.pomodoro__muted { color: var(--ld-text-muted); }

.pomodoro__controls {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity var(--ld-duration-fast) var(--ld-ease-standard);
}
.pomodoro:hover .pomodoro__controls,
.pomodoro:focus-within .pomodoro__controls { opacity: 1; }

.pomodoro__controls button,
.pomodoro__retry {
  min-width: 1.75rem;
  height: 1.75rem;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: var(--ld-radius-control);
  background: var(--ld-surface-3);
  color: var(--ld-text-primary);
  font: inherit;
  cursor: pointer;
}
.pomodoro button:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.pomodoro button:disabled { opacity: 0.6; cursor: default; }

.pomodoro__error { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: var(--ld-text-secondary); }
.pomodoro__retry { padding: 0 0.5rem; }

@keyframes pomodoro-glow { 50% { filter: drop-shadow(0 0 3.5px var(--tone)); } }
@keyframes pomodoro-blink { 50% { opacity: 0.35; } }

@media (prefers-reduced-motion: reduce) {
  .pomodoro--running .pomodoro__arc,
  .pomodoro--paused .pomodoro__ring { animation: none; }
}
</style>
