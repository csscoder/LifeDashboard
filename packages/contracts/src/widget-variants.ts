import { fail, isPlainText, isRecord, unknownKey, type ParseResult } from './parse.ts'

export interface WidgetVariant {
  id: string
  title: string
}

export interface WidgetVariants {
  default: string
  items: WidgetVariant[]
}

export const VARIANT_LIMITS = { items: 16 } as const

export function isVariantId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(value)
}

export function parseVariants(raw: unknown): ParseResult<WidgetVariants> {
  if (!isRecord(raw)) return fail('manifest.variants must be an object with default and items')
  const extra = unknownKey(raw, ['default', 'items'])
  if (extra !== undefined) return fail(`manifest.variants: unknown field "${extra}"`)
  if (!Array.isArray(raw.items) || raw.items.length < 2 || raw.items.length > VARIANT_LIMITS.items) {
    return fail('manifest.variants.items must have 2–16 entries')
  }
  const items: WidgetVariant[] = []
  const ids = new Set<string>()
  for (const [index, item] of raw.items.entries()) {
    const path = `manifest.variants.items[${index}]`
    if (!isRecord(item)) return fail(`${path} must be an object with id and title`)
    const extra = unknownKey(item, ['id', 'title'])
    if (extra !== undefined) return fail(`${path}: unknown field "${extra}"`)
    if (!isVariantId(item.id)) return fail(`${path}.id must match ^[a-z][a-z0-9-]{0,31}$`)
    if (ids.has(item.id)) return fail(`${path}.id "${item.id}" is a duplicate`)
    if (!isPlainText(item.title)) return fail(`${path}.title must be 1–60 characters of plain text`)
    ids.add(item.id)
    items.push({ id: item.id, title: item.title })
  }
  if (typeof raw.default !== 'string' || !ids.has(raw.default)) return fail('manifest.variants.default must be one of the item ids')
  return { ok: true, value: { default: raw.default, items } }
}

export function resolveVariant(variants: WidgetVariants | undefined, stored: string | null | undefined): string {
  if (!variants) return ''
  return variants.items.some((item) => item.id === stored) ? stored! : variants.default
}
