import { describe, expect, it } from 'vitest'
import { clockTimeZone, handAngles } from './clock.ts'

describe('time-zone hand angles', () => {
  const instant = new Date('2026-10-28T00:15:30.500Z')

  it('shows Asia/Tokyo at a fixed UTC instant', () => {
    expect(handAngles(instant, true, 'Asia/Tokyo')).toEqual({
      hour: 277.75416666666666, minute: 93.05, second: 183,
    })
  })

  it('falls back to UTC for an unknown zone', () => {
    const angles = handAngles(instant, false, 'Unknown/Zone')
    expect(angles.hour).toBeCloseTo(7.75)
    expect(angles.minute).toBe(93)
    expect(angles.second).toBe(180)
    expect(clockTimeZone('Unknown/Zone')).toBe('UTC')
  })
})
