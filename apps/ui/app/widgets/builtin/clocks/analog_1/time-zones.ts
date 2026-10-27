import type { ClockTime } from './clock-angles'

export interface OffsetGroup {
  /** Minutes east of UTC. */
  offset: number
  zones: string[]
}

/** Minutes east of UTC that `zone` is at on `date`; daylight saving time included. */
export function zoneOffset(zone: string, date: Date): number {
  const name = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value ?? ''
  // "GMT" at zero, otherwise "GMT+1", "GMT-9:30", "GMT+5:45".
  const match = /^GMT(?:([+\-−])(\d{1,2})(?::(\d{2}))?)?$/.exec(name)
  if (!match?.[1]) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0)
  return match[1] === '+' ? minutes : -minutes
}

/** Every zone the browser knows, grouped by its offset on `date`; UTC heads the zero group. */
export function offsetGroups(date: Date): OffsetGroup[] {
  const groups = new Map<number, string[]>()
  // `supportedValuesOf` omits UTC in some engines.
  for (const zone of new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])) {
    const offset = zoneOffset(zone, date)
    const zones = groups.get(offset)
    if (zones) zones.push(zone)
    else groups.set(offset, [zone])
  }
  return [...groups].map(([offset, zones]) => ({ offset, zones })).sort((a, b) => a.offset - b.offset)
}

/** "UTC+3", "GMT+5:45", "UTC-9:30". */
export function offsetLabel(offset: number, notation: string): string {
  const abs = Math.abs(offset)
  const minutes = abs % 60
  return `${notation}${offset < 0 ? '-' : '+'}${Math.floor(abs / 60)}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`
}

/** Reads the wall time of `zone`; throws a RangeError for a zone the browser does not know. */
export function zoneClock(zone: string): (date: Date) => ClockTime {
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
  return (date) => {
    const parts = Object.fromEntries(format.formatToParts(date).map((part) => [part.type, part.value]))
    return { h: Number(parts.hour), m: Number(parts.minute), s: Number(parts.second) }
  }
}

const localClock = (date: Date): ClockTime => ({ h: date.getHours(), m: date.getMinutes(), s: date.getSeconds() })

/** What the clock reads from its config; `zone` is null while it shows the system time, an unknown zone included. */
export function clockSource(config: Record<string, unknown>): { zone: string | null; read: (date: Date) => ClockTime } {
  const zone = config.zone
  if (config.systemTime !== false || typeof zone !== 'string') return { zone: null, read: localClock }
  try {
    return { zone, read: zoneClock(zone) }
  } catch {
    return { zone: null, read: localClock }
  }
}
