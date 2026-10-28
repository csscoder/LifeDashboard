import { describe, expect, it } from 'vitest'
import { numberFormatOptions } from '../app/ui/number-format'

describe('numberFormatOptions', () => {
  it.each([1e-21, 1e-101, Number.MIN_VALUE, Number.MAX_VALUE, 1e21, 0.1, 1.25, 0.30000000000000004, 123456.789012345, -2.5e-7])('round trips %s without precision loss', value => {
    const formatted = new Intl.NumberFormat('en-US', numberFormatOptions(false)).format(value)
    expect(Number(formatted)).toBe(value)
  })
  it('keeps short decimals short', () => expect(new Intl.NumberFormat('en-US', numberFormatOptions(false)).format(0.1)).toBe('0.1'))
  it('uses whole numbers for integer fields', () => expect(numberFormatOptions(true).maximumFractionDigits).toBe(0))
})
