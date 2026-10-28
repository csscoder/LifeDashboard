import { describe, expect, it } from 'vitest'
import { isVariantId, parseVariants, resolveVariant } from '../src/widget-variants.ts'

const variants = { default: 'classic', items: [{ id: 'classic', title: 'Classic' }, { id: 'roman', title: 'Roman numerals' }] }

describe('parseVariants', () => {
  it('keeps valid variants', () => {
    expect(parseVariants(structuredClone(variants))).toEqual({ ok: true, value: variants })
  })

  it.each([1, 17])('rejects %i items', (length) => {
    expect(parseVariants({ ...variants, items: Array.from({ length }, (_, i) => ({ id: `v${i}`, title: 'Look' })) })).toEqual({ ok: false, error: 'manifest.variants.items must have 2–16 entries' })
  })

  it.each(['Classic', '1a', 'a'.repeat(33)])('rejects invalid id %s', (id) => {
    expect(parseVariants({ ...variants, items: [{ id, title: 'Classic' }, variants.items[1]] })).toEqual({ ok: false, error: 'manifest.variants.items[0].id must match ^[a-z][a-z0-9-]{0,31}$' })
  })

  it('rejects duplicate ids', () => {
    expect(parseVariants({ ...variants, items: [variants.items[0], variants.items[0]] })).toEqual({ ok: false, error: 'manifest.variants.items[1].id "classic" is a duplicate' })
  })

  it.each(['', 'a'.repeat(61), 'Hidden\ntext', '   '])('rejects invalid title %s', (title) => {
    expect(parseVariants({ ...variants, items: [{ id: 'classic', title }, variants.items[1]] })).toEqual({ ok: false, error: 'manifest.variants.items[0].title must be 1–60 characters of plain text' })
  })

  it('requires the default to name an item', () => {
    expect(parseVariants({ ...variants, default: 'gothic' })).toEqual({ ok: false, error: 'manifest.variants.default must be one of the item ids' })
  })

  it('rejects unknown root and item fields', () => {
    expect(parseVariants({ ...variants, x: true })).toEqual({ ok: false, error: 'manifest.variants: unknown field "x"' })
    expect(parseVariants({ ...variants, items: [{ ...variants.items[0], x: true }, variants.items[1]] })).toEqual({ ok: false, error: 'manifest.variants.items[0]: unknown field "x"' })
  })

  it.each([null, [], 'classic', 5])('rejects non-objects %s', (raw) => {
    expect(parseVariants(raw)).toEqual({ ok: false, error: 'manifest.variants must be an object with default and items' })
  })

  it('accepts the maximum item and id lengths', () => {
    const items = Array.from({ length: 16 }, (_, i) => ({ id: `v${i}`, title: 'a'.repeat(60) }))
    items[0]!.id = 'a'.repeat(32)
    expect(parseVariants({ default: items[0]!.id, items })).toEqual({ ok: true, value: { default: items[0]!.id, items } })
  })
})

describe('isVariantId', () => {
  it.each(['classic', 'roman-2', 'a'.repeat(32)])('accepts %s', (id) => expect(isVariantId(id)).toBe(true))
  it.each(['Classic', '1a', '', 'a'.repeat(33), null, 1])('rejects %s', (id) => expect(isVariantId(id)).toBe(false))
})

describe('resolveVariant', () => {
  it('uses only declared stored ids, falling back to the default or empty string', () => {
    expect(resolveVariant(undefined, 'roman')).toBe('')
    expect(resolveVariant(variants, 'roman')).toBe('roman')
    expect(resolveVariant(variants, null)).toBe('classic')
    expect(resolveVariant(variants, undefined)).toBe('classic')
    expect(resolveVariant(variants, 'gone')).toBe('classic')
  })
})
