import { describe, expect, it } from 'vitest'
import { clockSource, offsetGroups, offsetLabel, zoneClock, zoneOffset } from '../app/widgets/builtin/clocks/analog_1/time-zones'

const winter = new Date('2026-01-15T12:00:00Z')
const summer = new Date('2026-07-15T12:00:00Z')
const groupOf = (zone: string, date: Date) => offsetGroups(date).find((group) => group.zones.includes(zone))?.offset

describe('zoneOffset', () => {
  it('follows daylight saving time where a zone has it', () => {
    expect(zoneOffset('Europe/Berlin', winter)).toBe(60)
    expect(zoneOffset('Europe/Berlin', summer)).toBe(120)
    expect(zoneOffset('Africa/Lagos', summer)).toBe(60)
    expect(zoneOffset('America/New_York', winter)).toBe(-300)
    expect(zoneOffset('UTC', summer)).toBe(0)
  })
})

describe('offsetGroups', () => {
  it('groups the zones by their offset on the given date, sorted by offset', () => {
    expect(groupOf('Europe/Berlin', winter)).toBe(60)
    expect(groupOf('Europe/Berlin', summer)).toBe(120)
    expect(groupOf('Asia/Katmandu', winter) ?? groupOf('Asia/Kathmandu', winter)).toBe(345)
    const offsets = offsetGroups(winter).map((group) => group.offset)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    expect(new Set(offsets).size).toBe(offsets.length)
  })

  it('puts UTC first in the zero group', () => {
    expect(offsetGroups(winter).find((group) => group.offset === 0)?.zones[0]).toBe('UTC')
  })
})

describe('offsetLabel', () => {
  it.each([
    [0, 'UTC', 'UTC+0'],
    [180, 'UTC', 'UTC+3'],
    [345, 'GMT', 'GMT+5:45'],
    [-570, 'UTC', 'UTC-9:30'],
  ] as const)('%i in %s → %s', (offset, notation, expected) => {
    expect(offsetLabel(offset, notation)).toBe(expected)
  })
})

describe('zoneClock', () => {
  it('reads the wall time of a zone, across midnight', () => {
    expect(zoneClock('Asia/Tokyo')(new Date('2026-01-15T15:30:45Z'))).toEqual({ h: 0, m: 30, s: 45 })
    expect(zoneClock('Asia/Kathmandu')(new Date('2026-01-15T12:00:00Z'))).toEqual({ h: 17, m: 45, s: 0 })
    expect(zoneClock('Europe/Berlin')(summer)).toEqual({ h: 14, m: 0, s: 0 })
  })

  it('rejects a zone the browser does not know', () => {
    expect(() => zoneClock('Mars/Olympus')).toThrow(RangeError)
  })
})

describe('clockSource', () => {
  const local = new Date(2026, 0, 15, 9, 41, 7)

  it('reads the local wall time while the system time is on', () => {
    const source = clockSource({ systemTime: true, zone: 'Asia/Tokyo' })
    expect(source.zone).toBeNull()
    expect(source.read(local)).toEqual({ h: 9, m: 41, s: 7 })
  })

  it('reads the chosen zone once the system time is off', () => {
    const source = clockSource({ systemTime: false, zone: 'Asia/Kathmandu' })
    expect(source.zone).toBe('Asia/Kathmandu')
    expect(source.read(new Date('2026-01-15T12:00:00Z'))).toEqual({ h: 17, m: 45, s: 0 })
  })

  it.each([['an unknown zone', 'Mars/Olympus'], ['no zone', undefined]])('falls back to the system time for %s', (_name, zone) => {
    const source = clockSource({ systemTime: false, zone })
    expect(source.zone).toBeNull()
    expect(source.read(local)).toEqual({ h: 9, m: 41, s: 7 })
  })
})
