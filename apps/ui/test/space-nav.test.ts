import { describe, expect, it } from 'vitest'
import { afterDelete } from '../app/spaces/nav'

describe('afterDelete', () => {
  it('returns the previous id for a middle or last delete', () => {
    expect(afterDelete(['a', 'b', 'c'], 'b')).toBe('a')
    expect(afterDelete(['a', 'b', 'c'], 'c')).toBe('b')
  })

  it('returns the next id when the first is deleted', () => {
    expect(afterDelete(['a', 'b', 'c'], 'a')).toBe('b')
  })

  it('returns null when the only id is deleted', () => {
    expect(afterDelete(['a'], 'a')).toBeNull()
  })
})
