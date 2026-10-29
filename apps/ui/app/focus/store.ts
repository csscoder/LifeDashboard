import { computed, onMounted, onUnmounted, shallowReactive, type ComputedRef } from 'vue'
import {
  DEFAULT_FOCUS_SETTINGS, initialRun, parseFocusRun, parseFocusSettings, parseProjectCreate, parseProjectPatch,
  type FocusPhase, type FocusProject, type FocusPutRequest, type FocusRun, type FocusSessionInput, type FocusSettings, type FocusState,
} from '@lifedashboard/contracts/focus'
import type { SpaceColor } from '@lifedashboard/contracts/space'
import { api, type ApiResult } from '../api'
import { showToast } from '../toasts'
import * as engine from './engine'

export type ProjectResult = { ok: true; project: FocusProject } | { ok: false; error: string }
type ProjectPatch = { name?: string; color?: SpaceColor; archived?: boolean }

export interface FocusStoreDeps {
  api: Pick<typeof api, 'focus' | 'saveFocus' | 'focusSessions' | 'createFocusProject' | 'updateFocusProject'>
  now: () => number
  newId: () => string
  onPhaseEnd(event: { from: FocusPhase; to: FocusPhase; nextMinutes: number }): void
  notice(text: string): void
}

export interface FocusStore {
  state: {
    loaded: boolean
    loadError: boolean
    settings: FocusSettings
    run: FocusRun
    projects: FocusProject[]
    recentLabels: string[]
    today: { day: string; count: number; focusMs: number }
  }
  status: ComputedRef<ReturnType<typeof engine.publicStatus>>
  load(): Promise<void>
  start(): void
  pause(): void
  resume(): void
  skip(): void
  reset(): void
  setTask(label: string | null, projectId: string | null): string | null
  saveSettings(settings: FocusSettings): string | null
  createProject(name: string, color: SpaceColor): Promise<ProjectResult>
  updateProject(id: string, patch: ProjectPatch): Promise<ProjectResult>
  enter(): () => void
  dispose(): void
}

const HEARTBEAT_MS = 30_000
const RETRY_MS = [2000, 5000, 15_000]
const RETRY_LATER_MS = 60_000
const RECENT_LABELS = 10

// Field by field: key order differs between engine spreads and the server's JSON.
function sameRun(a: unknown, b: unknown): boolean {
  const left = parseFocusRun(a)
  const right = parseFocusRun(b)
  if (!left.ok || !right.ok) return false
  const keys = Object.keys(left.value) as (keyof FocusRun)[]
  return keys.length === Object.keys(right.value).length && keys.every((key) => left.value[key] === right.value[key])
}

export function createFocusStore(deps: FocusStoreDeps): FocusStore {
  // Shallow: every field is replaced whole, so api bodies never carry proxies.
  const state = shallowReactive<FocusStore['state']>({
    loaded: false, loadError: false, settings: DEFAULT_FOCUS_SETTINGS, run: initialRun(DEFAULT_FOCUS_SETTINGS),
    projects: [], recentLabels: [], today: { day: engine.dayKey(deps.now()), count: 0, focusMs: 0 },
  })

  // The write chain (spec «store.ts»): `pending` is fixed once sent; later changes wait in `dirty`/`settingsDirty`.
  let revision = 0
  let unconfirmed: FocusSessionInput[] = []
  let dirty = false
  let settingsDirty = false
  let pending: FocusPutRequest | null = null
  let failures = 0
  let noticed = false

  let presence = 0
  let loading: Promise<void> | null = null
  let armed = false
  // Bumped by dispose: answers that arrive later are ignored.
  let generation = 0
  let deadline: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let midnight: ReturnType<typeof setTimeout> | undefined

  function setRun(run: FocusRun) {
    state.run = run
    clearTimeout(deadline)
    deadline = run.status === 'running' && run.endsAt !== null ? setTimeout(onDeadline, Math.max(0, run.endsAt - deps.now())) : undefined
    if (run.status === 'running') heartbeat ??= setInterval(onHeartbeat, HEARTBEAT_MS)
    else {
      clearInterval(heartbeat)
      heartbeat = undefined
    }
  }

  function rollToday(now: number) {
    const day = engine.dayKey(now)
    if (day !== state.today.day) state.today = { day, count: 0, focusMs: 0 }
  }

  function commit(step: engine.Step) {
    if (step.session) {
      rollToday(deps.now())
      unconfirmed = [...unconfirmed, step.session]
      const { today } = state
      if (step.session.day === today.day) {
        state.today = { day: today.day, count: today.count + (step.session.completed ? 1 : 0), focusMs: today.focusMs + step.session.focusMs }
      }
    }
    if (step.run === state.run) return
    setRun(step.run)
    dirty = true
  }

  // A Step carries at most one session: advance again until nothing changes.
  function catchUp() {
    for (let step = engine.advance(state.settings, state.run, deps.now(), deps.newId); step.run !== state.run;
      step = engine.advance(state.settings, state.run, deps.now(), deps.newId)) {
      const from = state.run.phase
      commit(step)
      deps.onPhaseEnd({ from, to: state.run.phase, nextMinutes: state.run.durationMs / 60_000 })
    }
  }

  function act(apply: (run: FocusRun, now: number) => engine.Step) {
    if (!state.loaded) return
    catchUp()
    commit(apply(state.run, deps.now()))
    write()
  }

  function onDeadline() {
    deadline = undefined
    catchUp()
    write()
  }

  function onHeartbeat() {
    catchUp()
    if (state.run.status === 'running') commit({ run: { ...state.run, seenAt: deps.now() } })
    write()
  }

  function onVisibility() {
    rollToday(deps.now())
    if (!state.loaded) return
    catchUp()
    write()
  }

  function armMidnight() {
    const next = new Date(deps.now())
    next.setHours(24, 0, 0, 0)
    midnight = setTimeout(() => {
      rollToday(deps.now())
      armMidnight()
    }, next.getTime() - deps.now())
  }

  // Ruling 2: nothing is armed at construction.
  function arm() {
    if (armed) return
    armed = true
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
    armMidnight()
    if (pending) void send(pending)
  }

  function adopt(server: FocusState, run = server.run) {
    revision = server.revision
    state.settings = server.settings
    dirty = settingsDirty = false
    setRun(run)
  }

  function write() {
    if (pending || !state.loaded || !(dirty || settingsDirty || unconfirmed.length)) return
    const session = unconfirmed[0]
    pending = { run: state.run, expectedRevision: revision, ...(settingsDirty ? { settings: state.settings } : {}), ...(session ? { session } : {}) }
    dirty = settingsDirty = false
    void send(pending)
  }

  function resolved() {
    pending = null
    failures = 0
    noticed = false
  }

  async function send(body: FocusPutRequest) {
    const current = generation
    const result = await deps.api.saveFocus(body)
    if (current !== generation) return
    if (result.ok) return confirmed(body, result.data.revision)
    if (result.kind === 'invalid') return rejected(body, result.message)
    if (result.kind !== 'conflict') return failed(body)
    const server = await deps.api.focus()
    if (current !== generation) return
    if (!server.ok) return failed(body)
    // Our own write had landed without an answer.
    if (sameRun(server.data.run, body.run)) return confirmed(body, server.data.revision)
    resolved()
    adopt(server.data)
    deps.notice('Focus changed in another tab; reloaded')
    write()
  }

  function confirmed(body: FocusPutRequest, next: number) {
    revision = next
    resolved()
    const label = body.session?.label
    unconfirmed = unconfirmed.filter(({ id }) => id !== body.session?.id)
    if (label?.trim()) state.recentLabels = [label, ...state.recentLabels.filter((item) => item !== label)].slice(0, RECENT_LABELS)
    write()
  }

  function failed(body: FocusPutRequest) {
    if (!noticed) deps.notice('Focus progress not saved yet')
    noticed = true
    retry = setTimeout(() => {
      retry = undefined
      void send(body)
    }, RETRY_MS[failures++] ?? RETRY_LATER_MS)
  }

  // Not retried: the server state replaces the change; the rejected session can never be stored (Ruling 12),
  // other unconfirmed sessions go with the next write.
  async function rejected(body: FocusPutRequest, message: string) {
    const current = generation
    unconfirmed = unconfirmed.filter(({ id }) => id !== body.session?.id)
    deps.notice(`Focus change rejected: ${message}`)
    const server = await deps.api.focus()
    if (current !== generation) return
    resolved()
    if (server.ok) adopt(server.data)
  }

  function load(): Promise<void> {
    arm()
    if (state.loaded) return Promise.resolve()
    return (loading ??= (async () => {
      const current = generation
      const result = await deps.api.focus()
      if (current !== generation) return
      if (!result.ok) {
        state.loadError = true
        return
      }
      const day = engine.dayKey(deps.now())
      const sessions = await deps.api.focusSessions(day, day)
      if (current !== generation) return
      // Ruling 13: today's totals never silently read as zero.
      if (!sessions.ok) {
        state.loadError = true
        return
      }
      const today = sessions.data
      state.today = { day, count: today.filter(({ completed }) => completed).length, focusMs: today.reduce((sum, { focusMs }) => sum + focusMs, 0) }
      // A hidden pause resumes only within the app session that made it.
      const stored: FocusRun = result.data.run.pausedBy === 'hidden' ? { ...result.data.run, pausedBy: 'user' } : result.data.run
      const step = engine.restore(result.data.settings, stored, deps.newId)
      adopt(result.data, step.run)
      state.projects = result.data.projects
      state.recentLabels = result.data.recentLabels
      state.loaded = true
      state.loadError = false
      // A phase that ended while the app was closed fires no alert; its session is still sent.
      commit({ run: state.run, ...(step.session ? { session: step.session } : {}) })
      write()
    })().finally(() => {
      loading = null
    }))
  }

  function enter(): () => void {
    arm()
    presence++
    if (!state.loaded) void load()
    else if (state.run.pausedBy === 'hidden') act((run, now) => engine.resume(state.settings, run, now, deps.newId))
    let left = false
    return () => {
      if (left) return
      left = true
      if (--presence === 0) act((run, now) => engine.pause(state.settings, run, now, 'hidden', deps.newId))
    }
  }

  function dispose() {
    generation++
    armed = false
    loading = null
    clearTimeout(deadline)
    clearInterval(heartbeat)
    clearTimeout(retry)
    clearTimeout(midnight)
    deadline = heartbeat = retry = midnight = undefined
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
  }

  function projectResult(result: ApiResult<FocusProject>): ProjectResult {
    if (!result.ok) return { ok: false, error: result.kind === 'invalid' ? result.message : 'API: unavailable' }
    const project = result.data
    const known = state.projects.some(({ id }) => id === project.id)
    state.projects = known ? state.projects.map((item) => (item.id === project.id ? project : item)) : [...state.projects, project]
    return { ok: true, project }
  }

  return {
    state,
    status: computed(() => engine.publicStatus(state.run)),
    load,
    start: () => act((run, now) => engine.start(state.settings, run, now, deps.newId)),
    pause: () => act((run, now) => engine.pause(state.settings, run, now, 'user', deps.newId)),
    resume: () => act((run, now) => engine.resume(state.settings, run, now, deps.newId)),
    skip: () => act((run, now) => engine.skip(state.settings, run, now, deps.newId)),
    reset: () => act((run, now) => engine.reset(state.settings, run, now, deps.newId)),
    setTask(label, projectId) {
      const parsed = parseFocusRun({ ...state.run, label, projectId })
      if (!parsed.ok) return parsed.error
      // Ruling 12: the server rejects an unknown project, and a session carrying it could never be stored.
      if (projectId !== null && !state.projects.some(({ id }) => id === projectId)) return 'Unknown project'
      act((run) => ({ run: { ...run, label, projectId } }))
      return null
    },
    saveSettings(settings) {
      const parsed = parseFocusSettings(settings)
      if (!parsed.ok) return parsed.error
      if (!state.loaded) return null
      // The current phase ends under the settings it began with.
      catchUp()
      state.settings = parsed.value
      settingsDirty = true
      write()
      return null
    },
    async createProject(name, color) {
      const parsed = parseProjectCreate({ name, color })
      return parsed.ok ? projectResult(await deps.api.createFocusProject(parsed.value)) : parsed
    },
    async updateProject(id, patch) {
      const parsed = parseProjectPatch(patch)
      return parsed.ok ? projectResult(await deps.api.updateFocusProject(id, parsed.value)) : parsed
    },
    enter,
    dispose,
  }
}

export const focusStore = createFocusStore({
  api,
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
  // Task 6 wires the phase-end alerts.
  onPhaseEnd: () => {},
  notice: (text) => showToast({ source: 'Pomodoro', title: text, body: '' }),
})

/** Each mounted Pomodoro widget counts as one view; the last one leaving pauses a running timer. */
export function useFocusPresence(): void {
  let leave: (() => void) | undefined
  onMounted(() => {
    leave = focusStore.enter()
  })
  onUnmounted(() => leave?.())
}
