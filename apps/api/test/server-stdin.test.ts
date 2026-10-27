import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'

async function startServer(exitOnEof: boolean) {
  const reservation = createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const address = reservation.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address')
  await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()))
  const dataDir = await mkdtemp(join(tmpdir(), 'lifedashboard-stdin-'))
  const env: NodeJS.ProcessEnv = { ...process.env, LIFEDASHBOARD_DATA_DIR: dataDir, LIFEDASHBOARD_API_PORT: String(address.port) }
  delete env.LIFEDASHBOARD_EXIT_ON_STDIN_EOF
  if (exitOnEof) env.LIFEDASHBOARD_EXIT_ON_STDIN_EOF = '1'
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.ts', import.meta.url))], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const exited = once(child, 'exit')
  let output = ''
  child.stderr.on('data', (chunk) => { output += String(chunk) })
  const cleanup = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await exited
    await rm(dataDir, { recursive: true, force: true })
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`API did not become ready: ${output}`)), 5000)
      child.stdout.on('data', (chunk) => {
        output += String(chunk)
        if (output.includes('LifeDashboard API listening on')) {
          clearTimeout(timer)
          resolve()
        }
      })
      void exited.then(() => {
        clearTimeout(timer)
        reject(new Error(`API exited before becoming ready: ${output}`))
      })
    })
  } catch (error) {
    await cleanup()
    throw error
  }
  return { child, exited, cleanup }
}

describe('server stdin lifecycle', () => {
  it('exits successfully on stdin EOF when requested by the desktop', async () => {
    const { child, exited, cleanup } = await startServer(true)
    try {
      child.stdin.end()
      const result = await Promise.race([exited, delay(5000, 'timeout')])
      expect(result).toEqual([0, null])
    } finally {
      await cleanup()
    }
  }, 12000)

  it('keeps running after stdin EOF without the desktop opt-in', async () => {
    const { child, cleanup } = await startServer(false)
    try {
      child.stdin.end()
      await delay(1000)
      expect(child.exitCode).toBeNull()
      expect(child.signalCode).toBeNull()
    } finally {
      await cleanup()
    }
  }, 12000)
})
