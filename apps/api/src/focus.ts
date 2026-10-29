import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { FastifyInstance } from 'fastify'
import {
  DEFAULT_FOCUS_SETTINGS,
  initialRun,
  parseFocusPut,
  parseProjectCreate,
  parseProjectPatch,
  parseSessionRange,
  type FocusProject,
  type FocusPutRequest,
  type FocusSession,
  type FocusState,
} from '@lifedashboard/contracts/focus'
import type { SpaceColor } from '@lifedashboard/contracts/space'
import { ApiError, ok } from './errors.ts'
import { transaction } from './spaces.ts'

export interface FocusDeps {
  db: DatabaseSync
  now: () => Date
}

interface ProjectRow {
  id: string
  name: string
  color: SpaceColor
  archived_at: string | null
}

interface SessionRow {
  id: string
  day: string
  started_at: string
  ended_at: string
  planned_ms: number
  focus_ms: number
  completed: number
  label: string | null
  project_id: string | null
}

const PROJECT_COLUMNS = 'SELECT id, name, color, archived_at FROM focus_projects'

export function registerFocus(app: FastifyInstance, { db, now }: FocusDeps): void {
  app.get('/api/v1/focus', async (request) => ok(request, readState(db, now())))

  app.put('/api/v1/focus', async (request) => ok(request, saveState(db, request.body, now())))

  app.get<{ Querystring: { from?: string; to?: string } }>('/api/v1/focus/sessions', async (request) => {
    const range = parseSessionRange(request.query.from, request.query.to)
    if (!range.ok) throw new ApiError('VALIDATION_ERROR', range.error)
    const rows = db
      .prepare('SELECT * FROM focus_sessions WHERE day >= ? AND day <= ? ORDER BY ended_at, id')
      .all(range.value.from, range.value.to) as unknown as SessionRow[]
    return ok(request, rows.map(sessionOf))
  })

  app.post('/api/v1/focus/projects', async (request) => {
    const result = parseProjectCreate(request.body)
    if (!result.ok) throw new ApiError('VALIDATION_ERROR', result.error)
    const id = randomUUID()
    db.prepare('INSERT INTO focus_projects (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(id, result.value.name, result.value.color, now().toISOString())
    return ok(request, readProject(db, id))
  })

  app.patch<{ Params: { id: string } }>('/api/v1/focus/projects/:id', async (request) => {
    const result = parseProjectPatch(request.body)
    if (!result.ok) throw new ApiError('VALIDATION_ERROR', result.error)
    const { name = null, color = null, archived } = result.value
    const changed = db
      .prepare('UPDATE focus_projects SET name = COALESCE(?, name), color = COALESCE(?, color), archived_at = CASE WHEN ? THEN ? ELSE archived_at END WHERE id = ?')
      .run(name, color, Number(archived !== undefined), archived ? now().toISOString() : null, request.params.id)
    if (changed.changes === 0) throw new ApiError('NOT_FOUND', 'Project not found')
    return ok(request, readProject(db, request.params.id))
  })
}

function projectOf(row: ProjectRow): FocusProject {
  return { id: row.id, name: row.name, color: row.color, archivedAt: row.archived_at }
}

function readProject(db: DatabaseSync, id: string): FocusProject {
  return projectOf(db.prepare(`${PROJECT_COLUMNS} WHERE id = ?`).get(id) as unknown as ProjectRow)
}

function sessionOf(row: SessionRow): FocusSession {
  return {
    id: row.id, day: row.day, startedAt: row.started_at, endedAt: row.ended_at, plannedMs: row.planned_ms,
    focusMs: row.focus_ms, completed: row.completed === 1, label: row.label, projectId: row.project_id,
  }
}

// The single row is created on first read (spec «Tables»).
function ensureRow(db: DatabaseSync, now: Date): { settings: string; run: string; revision: number } {
  const select = 'SELECT settings, run, revision FROM focus WHERE id = 1'
  const row = db.prepare(select).get() as { settings: string; run: string; revision: number } | undefined
  if (row) return row
  db.prepare('INSERT INTO focus (id, settings, run, revision, updated_at) VALUES (1, ?, ?, 1, ?)').run(
    JSON.stringify(DEFAULT_FOCUS_SETTINGS), JSON.stringify(initialRun(DEFAULT_FOCUS_SETTINGS)), now.toISOString(),
  )
  return db.prepare(select).get() as { settings: string; run: string; revision: number }
}

function readState(db: DatabaseSync, now: Date): FocusState {
  return transaction(db, () => {
    const row = ensureRow(db, now)
    const projects = (db.prepare(`${PROJECT_COLUMNS} ORDER BY created_at, id`).all() as unknown as ProjectRow[]).map(projectOf)
    const labels = db
      .prepare("SELECT label FROM focus_sessions WHERE label IS NOT NULL AND label <> '' GROUP BY label ORDER BY MAX(ended_at) DESC LIMIT 10")
      .all() as unknown as { label: string }[]
    return {
      settings: JSON.parse(row.settings), run: JSON.parse(row.run), revision: row.revision,
      projects, recentLabels: labels.map(({ label }) => label),
    }
  })
}

function saveState(db: DatabaseSync, raw: unknown, now: Date): { revision: number } {
  const parsed = parseFocusPut(raw)
  if (!parsed.ok) throw new ApiError('VALIDATION_ERROR', parsed.error)
  const { settings, run, session, expectedRevision }: FocusPutRequest = parsed.value
  return transaction(db, () => {
    const row = ensureRow(db, now)
    if (row.revision !== expectedRevision) throw new ApiError('REVISION_CONFLICT', 'The focus state changed since it was loaded')
    const exists = db.prepare('SELECT 1 FROM focus_projects WHERE id = ?')
    for (const projectId of [run.projectId, session?.projectId ?? null]) {
      if (projectId !== null && !exists.get(projectId)) throw new ApiError('VALIDATION_ERROR', 'Unknown project')
    }
    if (session) {
      db.prepare('INSERT OR IGNORE INTO focus_sessions (id, day, started_at, ended_at, planned_ms, focus_ms, completed, label, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        session.id, session.day, session.startedAt, session.endedAt, session.plannedMs, session.focusMs, Number(session.completed), session.label, session.projectId,
      )
    }
    const revision = row.revision + 1
    db.prepare('UPDATE focus SET settings = COALESCE(?, settings), run = ?, revision = ?, updated_at = ? WHERE id = 1').run(
      settings ? JSON.stringify(settings) : null, JSON.stringify(run), revision, now.toISOString(),
    )
    return { revision }
  })
}
