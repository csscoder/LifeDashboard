<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { gsap } from 'gsap'
import { useWidget } from '@lifedashboard/widget-sdk'
import { SPACE_COLORS } from '@lifedashboard/contracts/space'
import { alerts } from '../../../focus/alerts'
import { focusStore, useFocusPresence } from '../../../focus/store'
import FocusStatsDialog from './FocusStatsDialog.vue'
import TaskPicker from './TaskPicker.vue'
import tomato from './tomato.webp'
import { formatClock, formatTotal, goalDots, isCompact, playButton, remainingMs, restText, ringProgress, ringTone, showsSkip, toggleAction } from './view'

const { context } = useWidget()
useFocusPresence()

const state = focusStore.state
const now = ref(Date.now())
const statsOpen = ref(false)
const run = computed(() => state.run)
const clock = computed(() => formatClock(remainingMs(run.value, now.value)))
const progress = computed(() => ringProgress(run.value, now.value))
const tone = computed(() => ringTone(run.value, state.today.count, state.settings.dailyGoal))
const dots = computed(() => goalDots(state.today.count, state.settings.dailyGoal))
const goalMet = computed(() => state.today.count >= state.settings.dailyGoal)
const compact = computed(() => isCompact(context.size))
const project = computed(() => state.projects.find(({ id }) => id === run.value.projectId))
const rest = computed(() => restText(run.value))
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

// During a break the tomato sleeps: Zzz drift from its shoulder and it breathes; still letters under reduced motion.
const face = useTemplateRef<HTMLElement>('face')
let sleep: gsap.Context | undefined
function wake() {
  sleep?.revert()
  sleep = undefined
}
// The face element is part of the source: the first run happens in setup, before it exists.
watch(
  () => (rest.value !== null && context.visible ? face.value : null),
  (target) => {
    wake()
    if (!target) return
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    sleep = gsap.context(() => {
      const letters = gsap.utils.toArray<HTMLElement>('.pomodoro__zzz span')
      if (reduced) {
        letters.forEach((letter, index) => gsap.set(letter, { x: `${index * 0.6}em`, y: `${-index * 0.9}em`, scale: 0.7 + index * 0.25, opacity: 1 }))
        return
      }
      const drift = gsap.timeline({ repeat: -1 })
      letters.forEach((letter, index) => {
        const at = index * 0.9
        drift
          .fromTo(letter, { x: 0, y: 0, scale: 0.5, rotation: -12 }, { x: '1.4em', y: '-2.4em', scale: 1.15, rotation: 10, duration: 2.6, ease: 'sine.out' }, at)
          .fromTo(letter, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.out' }, at)
          .to(letter, { opacity: 0, duration: 0.9, ease: 'power1.in' }, at + 1.7)
      })
      gsap.to('.pomodoro__tomato', { scaleX: 1.015, scaleY: 0.985, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 90%' })
    }, target)
  },
  { flush: 'post', immediate: true },
)
onUnmounted(wake)

/** ▶/⏸, the tomato and Space. Ruling 14: act now; prime in the same gesture so the phase-end chime and notification may play. */
function toggle() {
  if (!state.loaded) return
  const action = toggleAction(run.value)
  focusStore[action]()
  if (action !== 'pause') void alerts.prime()
}

// Only the focused tile itself: inner buttons already activate on Space. A held key toggles once.
function onKey(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return
  event.preventDefault()
  if (event.repeat) return
  toggle()
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

      <div ref="face" class="pomodoro__face">
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
        <div v-if="rest" class="pomodoro__zzz" aria-hidden="true"><span>z</span><span>z</span><span>Z</span></div>
        <div class="pomodoro__center">
          <!-- The task sits on the tomato above the clock; a break shows the rest text, and the picker still opens. -->
          <TaskPicker v-if="!compact" :store="focusStore">
            <button type="button" class="pomodoro__label" :aria-label="run.label || 'Set task'" :disabled="!state.loaded">
              <template v-if="rest"><span>{{ rest }}</span></template>
              <template v-else>
                <i v-if="project" class="pomodoro__project" :style="{ background: `oklch(0.7 0.15 ${SPACE_COLORS[project.color]})` }" :title="project.name" />
                <span :class="{ 'pomodoro__muted': !run.label }">{{ run.label || project?.name || 'No task' }}</span>
              </template>
            </button>
          </TaskPicker>
          <span class="pomodoro__clock" role="timer" :aria-label="`${phaseName}, ${clock} left`">{{ clock }}</span>
          <button v-if="playButton(run)" type="button" class="pomodoro__play" :aria-label="playButton(run)!" :disabled="!state.loaded" @click="toggle">▶</button>
        </div>
      </div>

      <div class="pomodoro__controls">
        <button type="button" :aria-label="run.status === 'running' ? 'Pause' : 'Start'" :disabled="!state.loaded" @click="toggle">{{ run.status === 'running' ? '⏸' : '▶' }}</button>
        <button v-if="showsSkip(run)" type="button" aria-label="Skip" :disabled="!state.loaded" @click="focusStore.skip()">⏭</button>
        <!-- aria-disabled, not disabled: stays focusable while ready, where reset changes nothing. -->
        <button type="button" aria-label="Reset" :aria-disabled="run.status === 'ready'" :disabled="!state.loaded" @click="focusStore.reset()">↺</button>
      </div>
      <button type="button" class="pomodoro__stats" aria-label="Statistics" @click="statsOpen = true">▥</button>
    </template>
    <FocusStatsDialog v-model:open="statsOpen" />
  </div>
</template>

<style scoped>
.pomodoro {
  --tone: oklch(0.64 0.22 27);
  /* The ring takes the height left after the 4cqmin top padding, the goal line (≈7.5cqmin), the 1cqmin gap and an
     equal 4cqmin below it; the tomato fills 83 % of the ring. */
  --face: min(100cqw, calc(100cqh - 17cqmin));
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start; /* the free space below is left to the controls */
  gap: 1cqmin;
  box-sizing: border-box;
  height: 100%;
  padding-top: 4cqmin;
  color: var(--ld-text-primary);
  outline: none;
}
.pomodoro:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; border-radius: var(--ld-radius-control); }
.pomodoro--break { --tone: oklch(0.72 0.17 150); }
.pomodoro--goal { --tone: oklch(0.82 0.15 85); }
.pomodoro--compact { --face: min(100cqw, 100cqh); }

.pomodoro__goal { color: var(--ld-text-secondary); font-size: max(0.625em, calc(5cqmin * var(--ld-content-scale, 1))); font-variant-numeric: tabular-nums; }
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
.pomodoro__tomato { position: absolute; inset: 8.5%; width: 83%; height: 83%; object-fit: contain; cursor: pointer; user-select: none; }

.pomodoro__center {
  position: absolute;
  inset: 0;
  /* Equal outer rows keep the clock centred; ▶ hangs in the bottom one. */
  display: grid;
  grid-template-rows: 1fr auto 1fr;
  justify-items: center;
  gap: calc(var(--face) * 0.024);
  padding-top: calc(var(--face) * 0.19);
  pointer-events: none;
}
.pomodoro__clock {
  grid-row: 2;
  color: #fff;
  font-family: var(--ld-font-mono);
  font-size: calc(var(--face) * 0.19 * var(--ld-content-scale, 1));
  font-weight: var(--ld-weight-strong);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-shadow: 0 0.05em 0.15em oklch(0.2 0.08 27 / 0.7);
}
.pomodoro__play {
  grid-row: 3;
  align-self: start;
  margin-top: calc(var(--face) * 0.032);
  pointer-events: auto;
  width: calc(var(--face) * 0.17);
  height: calc(var(--face) * 0.17);
  border: 0;
  border-radius: 50%;
  background: oklch(1 0 0 / 0.85);
  color: oklch(0.45 0.18 27);
  font-size: calc(var(--face) * 0.072 * var(--ld-content-scale, 1));
  cursor: pointer;
}

/* On the red of the tomato, like the clock: white with the same shadow, kept within the tomato's width. */
.pomodoro__label {
  grid-row: 1;
  align-self: end;
  justify-self: center;
  display: flex;
  align-items: center;
  gap: 0.35em;
  max-width: calc(var(--face) * 0.6);
  padding: 0;
  border: 0;
  background: none;
  color: #fff;
  font: inherit;
  font-size: calc(var(--face) * 0.06 * var(--ld-content-scale, 1));
  font-weight: var(--ld-weight-strong);
  text-shadow: 0 0.05em 0.15em oklch(0.2 0.08 27 / 0.7);
  cursor: pointer;
  pointer-events: auto;
}
.pomodoro__label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pomodoro__project { flex: none; width: 0.6em; height: 0.6em; border-radius: 50%; box-shadow: 0 0 0 0.1em #fff; }
.pomodoro__muted { opacity: 0.75; }

/* The tomato's top-right shoulder; gsap moves the letters from here. */
.pomodoro__zzz {
  position: absolute;
  top: 30%;
  right: 17%;
  color: #fff;
  font-family: var(--ld-font-mono);
  font-size: calc(var(--face) * 0.07 * var(--ld-content-scale, 1));
  font-weight: var(--ld-weight-strong);
  line-height: 1;
  text-shadow: 0 0.05em 0.15em oklch(0.2 0.08 27 / 0.7);
  pointer-events: none;
}
.pomodoro__zzz span { position: absolute; right: 0; bottom: 0; opacity: 0; }

/* Corner buttons sit 0.25rem in: the focus ring (0.125rem at a 0.125rem offset) would be clipped by the card. */
.pomodoro__controls {
  position: absolute;
  right: 0.25rem;
  bottom: 0.25rem;
  display: flex;
  gap: 0.25em;
  opacity: 0;
  transition: opacity var(--ld-duration-fast) var(--ld-ease-standard);
}
.pomodoro:hover .pomodoro__controls,
.pomodoro:focus-within .pomodoro__controls { opacity: 1; }
.pomodoro__stats { position: absolute; top: 0.25rem; right: 0.25rem; opacity: 0; transition: opacity var(--ld-duration-fast) var(--ld-ease-standard); }
.pomodoro:hover .pomodoro__stats,
.pomodoro:focus-within .pomodoro__stats { opacity: 1; }

.pomodoro__controls button,
.pomodoro__stats,
.pomodoro__retry {
  min-width: 1.75em;
  height: 1.75em;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: var(--ld-radius-control);
  background: var(--ld-surface-3);
  color: var(--ld-text-primary);
  font: inherit;
  cursor: pointer;
}
.pomodoro button:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
.pomodoro button:disabled,
.pomodoro button[aria-disabled='true'] { opacity: 0.6; cursor: default; }

.pomodoro__error { margin-block: auto; display: flex; flex-direction: column; align-items: center; gap: 0.5em; color: var(--ld-text-secondary); }
.pomodoro__retry { padding: 0 0.5em; }

@keyframes pomodoro-glow { 50% { filter: drop-shadow(0 0 3.5px var(--tone)); } }
@keyframes pomodoro-blink { 50% { opacity: 0.35; } }

@media (prefers-reduced-motion: reduce) {
  .pomodoro--running .pomodoro__arc,
  .pomodoro--paused .pomodoro__ring { animation: none; }
}
</style>
