import { HIDDEN_TEXT, fail, isRecord, unknownKey, type ParseResult } from './parse.ts'
import { isSpaceColor, type SpaceColor } from './space.ts'

export interface FocusSettings {
  focusMin: number
  shortBreakMin: number
  longBreakMin: number
  longBreakEvery: number
  dailyGoal: number
  autoStartBreak: boolean
  autoStartFocus: boolean
  sound: boolean
}

export type FocusPhase = 'focus' | 'short' | 'long'

export interface FocusRun {
  phase: FocusPhase
  status: 'ready' | 'running' | 'paused'
  durationMs: number
  endsAt: number | null
  remainingMs: number
  resumedAt: number | null
  pausedBy: 'user' | 'hidden' | null
  phaseStartedAt: string | null
  focusedMs: number
  streak: number
  label: string | null
  projectId: string | null
  seenAt: number | null
}

export interface FocusSessionInput {
  id: string
  day: string
  startedAt: string
  endedAt: string
  plannedMs: number
  focusMs: number
  completed: boolean
  label: string | null
  projectId: string | null
}

export interface FocusSession extends FocusSessionInput {}

export interface FocusProject {
  id: string
  name: string
  color: SpaceColor
  archivedAt: string | null
}

export interface FocusState {
  settings: FocusSettings
  run: FocusRun
  revision: number
  projects: FocusProject[]
  recentLabels: string[]
}

export interface FocusPutRequest {
  settings?: FocusSettings
  run: FocusRun
  session?: FocusSessionInput
  expectedRevision: number
}

export const FOCUS_LIMITS = {
  focusMin: [1, 120],
  shortBreakMin: [1, 60],
  longBreakMin: [1, 60],
  longBreakEvery: [2, 12],
  dailyGoal: [1, 24],
  label: 120,
  projectName: 40,
  rangeDays: 366,
  minRecordedMs: 60_000,
} as const

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  dailyGoal: 8,
  autoStartBreak: true,
  autoStartFocus: false,
  sound: true,
}

export function initialRun(settings: FocusSettings): FocusRun {
  const durationMs = settings.focusMin * 60_000
  return {
    phase: 'focus', status: 'ready', durationMs, endsAt: null, remainingMs: durationMs, resumedAt: null, pausedBy: null,
    phaseStartedAt: null, focusedMs: 0, streak: 0, label: null, projectId: null, seenAt: null,
  }
}

const SETTINGS_KEYS = ['focusMin', 'shortBreakMin', 'longBreakMin', 'longBreakEvery', 'dailyGoal', 'autoStartBreak', 'autoStartFocus', 'sound']
const RUN_KEYS = ['phase', 'status', 'durationMs', 'endsAt', 'remainingMs', 'resumedAt', 'pausedBy', 'phaseStartedAt', 'focusedMs', 'streak', 'label', 'projectId', 'seenAt']
const SESSION_KEYS = ['id', 'day', 'startedAt', 'endedAt', 'plannedMs', 'focusMs', 'completed', 'label', 'projectId']
const PUT_KEYS = ['settings', 'run', 'session', 'expectedRevision']

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

function isNonNegInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && !Number.isNaN(Date.parse(value))
}

// A real calendar date, not just the right shape.
function dayMs(value: unknown): number | undefined {
  if (typeof value !== 'string' || !DAY.test(value)) return undefined
  const ms = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value ? undefined : ms
}

function textProblem(value: string, max: number): string | undefined {
  if ([...value].length > max) return `must be at most ${max} characters`
  if (/[\u0000-\u001f\u007f]/.test(value) || HIDDEN_TEXT.test(value)) return 'must not contain control or hidden characters'
  return undefined
}

function readLabel(value: unknown): ParseResult<string | null> {
  if (value === null) return { ok: true, value }
  if (typeof value !== 'string') return fail('label must be a string or null')
  const problem = textProblem(value, FOCUS_LIMITS.label)
  return problem ? fail(`label ${problem}`) : { ok: true, value }
}

function readProjectId(value: unknown): ParseResult<string | null> {
  if (value === null) return { ok: true, value }
  return typeof value === 'string' && value !== '' && value.length <= 64 ? { ok: true, value } : fail('projectId must be a non-empty string or null')
}

export function parseFocusSettings(raw: unknown): ParseResult<FocusSettings> {
  if (!isRecord(raw)) return fail('settings must be an object')
  const extra = unknownKey(raw, SETTINGS_KEYS)
  if (extra !== undefined) return fail(`unknown field "${extra}"`)
  const out: Record<string, number | boolean> = {}
  for (const key of ['focusMin', 'shortBreakMin', 'longBreakMin', 'longBreakEvery', 'dailyGoal'] as const) {
    const [min, max] = FOCUS_LIMITS[key]
    const value = raw[key]
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) return fail(`${key} must be an integer ${min}..${max}`)
    out[key] = value as number
  }
  for (const key of ['autoStartBreak', 'autoStartFocus', 'sound'] as const) {
    if (typeof raw[key] !== 'boolean') return fail(`${key} must be a boolean`)
    out[key] = raw[key]
  }
  return { ok: true, value: out as unknown as FocusSettings }
}

export function parseFocusRun(raw: unknown): ParseResult<FocusRun> {
  if (!isRecord(raw)) return fail('run must be an object')
  const extra = unknownKey(raw, RUN_KEYS)
  if (extra !== undefined) return fail(`unknown field "${extra}"`)
  if (raw.phase !== 'focus' && raw.phase !== 'short' && raw.phase !== 'long') return fail('phase must be focus, short or long')
  if (raw.status !== 'ready' && raw.status !== 'running' && raw.status !== 'paused') return fail('status must be ready, running or paused')
  if (raw.pausedBy !== null && raw.pausedBy !== 'user' && raw.pausedBy !== 'hidden') return fail('pausedBy must be user, hidden or null')
  for (const key of ['durationMs', 'remainingMs', 'focusedMs', 'streak'] as const) {
    if (!isNonNegInt(raw[key])) return fail(`${key} must be a non-negative integer`)
  }
  for (const key of ['endsAt', 'resumedAt', 'seenAt'] as const) {
    if (raw[key] !== null && !isNonNegInt(raw[key])) return fail(`${key} must be a non-negative integer or null`)
  }
  if (raw.phaseStartedAt !== null && !isIso(raw.phaseStartedAt)) return fail('phaseStartedAt must be an ISO date or null')
  if (raw.status === 'running' && (raw.endsAt === null || raw.resumedAt === null)) return fail('a running run needs endsAt and resumedAt')
  const label = readLabel(raw.label)
  if (!label.ok) return label
  const projectId = readProjectId(raw.projectId)
  if (!projectId.ok) return projectId
  return { ok: true, value: { ...(raw as unknown as FocusRun), label: label.value, projectId: projectId.value } }
}

export function parseFocusSession(raw: unknown): ParseResult<FocusSessionInput> {
  if (!isRecord(raw)) return fail('session must be an object')
  const extra = unknownKey(raw, SESSION_KEYS)
  if (extra !== undefined) return fail(`unknown field "${extra}"`)
  if (typeof raw.id !== 'string' || raw.id === '' || raw.id.length > 64) return fail('id must be a non-empty string')
  if (dayMs(raw.day) === undefined) return fail('day must be a YYYY-MM-DD date')
  if (!isIso(raw.startedAt) || !isIso(raw.endedAt)) return fail('startedAt and endedAt must be ISO dates')
  if (Date.parse(raw.endedAt) < Date.parse(raw.startedAt)) return fail('endedAt must not be before startedAt')
  if (!isNonNegInt(raw.plannedMs) || !isNonNegInt(raw.focusMs)) return fail('plannedMs and focusMs must be non-negative integers')
  if (typeof raw.completed !== 'boolean') return fail('completed must be a boolean')
  const label = readLabel(raw.label)
  if (!label.ok) return label
  const projectId = readProjectId(raw.projectId)
  if (!projectId.ok) return projectId
  return { ok: true, value: { ...(raw as unknown as FocusSessionInput), label: label.value, projectId: projectId.value } }
}

export function parseFocusPut(raw: unknown): ParseResult<FocusPutRequest> {
  if (!isRecord(raw)) return fail('request must be an object')
  const extra = unknownKey(raw, PUT_KEYS)
  if (extra !== undefined) return fail(`unknown field "${extra}"`)
  if (!isNonNegInt(raw.expectedRevision)) return fail('expectedRevision must be a non-negative integer')
  const run = parseFocusRun(raw.run)
  if (!run.ok) return run
  const value: FocusPutRequest = { run: run.value, expectedRevision: raw.expectedRevision }
  if (raw.settings !== undefined) {
    const settings = parseFocusSettings(raw.settings)
    if (!settings.ok) return settings
    value.settings = settings.value
  }
  if (raw.session !== undefined) {
    const session = parseFocusSession(raw.session)
    if (!session.ok) return session
    value.session = session.value
  }
  return { ok: true, value }
}

function readProjectName(value: unknown): ParseResult<string> {
  if (typeof value !== 'string') return fail('name must be a string')
  const name = value.trim()
  const length = [...name].length
  if (length < 1 || length > FOCUS_LIMITS.projectName) return fail(`name must be 1..${FOCUS_LIMITS.projectName} characters`)
  if (/[\u0000-\u001f\u007f]/.test(name) || HIDDEN_TEXT.test(name)) return fail('name must not contain control or hidden characters')
  return { ok: true, value: name }
}

export function parseProjectCreate(raw: unknown): ParseResult<{ name: string; color: SpaceColor }> {
  if (!isRecord(raw)) return fail('project must be an object')
  const extra = unknownKey(raw, ['name', 'color'])
  if (extra !== undefined) return fail(`unknown field "${extra}"`)
  const name = readProjectName(raw.name)
  if (!name.ok) return name
  if (!isSpaceColor(raw.color)) return fail('color must be one of the space colours')
  return { ok: true, value: { name: name.value, color: raw.color } }
}

export function parseProjectPatch(raw: unknown): ParseResult<{ name?: string; color?: SpaceColor; archived?: boolean }> {
  if (!isRecord(raw)) return fail('project must be an object')
  const extra = unknownKey(raw, ['name', 'color', 'archived'])
  if (extra !== undefined) return fail(`unknown field "${extra}"`)
  const patch: { name?: string; color?: SpaceColor; archived?: boolean } = {}
  if (raw.name !== undefined) {
    const name = readProjectName(raw.name)
    if (!name.ok) return name
    patch.name = name.value
  }
  if (raw.color !== undefined) {
    if (!isSpaceColor(raw.color)) return fail('color must be one of the space colours')
    patch.color = raw.color
  }
  if (raw.archived !== undefined) {
    if (typeof raw.archived !== 'boolean') return fail('archived must be a boolean')
    patch.archived = raw.archived
  }
  if (Object.keys(patch).length === 0) return fail('nothing to change')
  return { ok: true, value: patch }
}

export function parseSessionRange(from: unknown, to: unknown): ParseResult<{ from: string; to: string }> {
  const start = dayMs(from)
  const end = dayMs(to)
  if (start === undefined || end === undefined) return fail('from and to must be YYYY-MM-DD dates')
  if (end < start) return fail('to must not be before from')
  if ((end - start) / 86_400_000 + 1 > FOCUS_LIMITS.rangeDays) return fail(`range must be at most ${FOCUS_LIMITS.rangeDays} days`)
  return { ok: true, value: { from: from as string, to: to as string } }
}
