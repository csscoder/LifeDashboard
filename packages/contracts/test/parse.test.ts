import { describe, expect, it } from 'vitest'
import { isPlainText } from '../src/parse.ts'

describe('isPlainText', () => {
  it.each(['   ', '\u0085', 'a\u200bb', 'a\u200eb', 'a\u202eb', 'a\u2066b', 'a\u2028b'])('rejects blank or hidden text %j', (value) => {
    expect(isPlainText(value)).toBe(false)
  })

  it.each(['Weather', 'Météo de Paris', '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}', 'می\u200cخواهم'])('accepts readable international text %j', (value) => {
    expect(isPlainText(value)).toBe(true)
  })
})
