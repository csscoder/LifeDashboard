import { onMounted, onUnmounted, reactive, watch } from 'vue'
import type { Size } from '@lifedashboard/contracts/grid'
import { sizeClass, type FocusStatus, type WidgetContext } from '@lifedashboard/contracts/widget-gateway'
import { themeMeta } from '../theme/builtin'
import { OPTIONAL_TOKENS, REQUIRED_TOKENS } from '../theme/contract'

const TOKEN_NAMES = [...Object.keys(REQUIRED_TOKENS), ...Object.keys(OPTIONAL_TOKENS)].map((name) => `--ld-${name}`)

/** Resolved theme tokens (docs/theme-contract.md) on a widget frame; a sandbox frame inherits nothing. */
export function readThemeTokens(el: Element): Record<string, string> {
  const style = getComputedStyle(el)
  const tokens: Record<string, string> = {}
  for (const name of TOKEN_NAMES) {
    const value = style.getPropertyValue(name).trim()
    if (value) tokens[name] = value
  }
  return tokens
}

function rootFontSize(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
}

/** The reactive WidgetContext of one widget; both hosts read it. Call inside setup(). */
export function useWidgetContext(source: {
  size: () => Size
  themeId: () => string
  // True when the widget's theme differs from the board's: comfort.css swaps surface-1 and blur.
  foreign: () => boolean
  // Serialized font variables of the frame; a font change alone re-reads the tokens.
  fonts: () => string
  variant: () => string
  contentScale: () => number
  focus: () => FocusStatus
  config: () => Record<string, unknown>
  frame: () => Element | null
  frameMode: () => WidgetContext['frame']
}): WidgetContext {
  const initial = source.size()
  const context = reactive<WidgetContext>({
    size: { w: initial.w, h: initial.h },
    sizeClass: sizeClass(initial),
    frame: source.frameMode(),
    theme: { id: source.themeId(), scheme: themeMeta(source.themeId()).mode, tokens: {} },
    rootFontSize: 16,
    config: source.config(),
    variant: source.variant(),
    contentScale: source.contentScale(),
    focus: source.focus(),
    locale: navigator.language,
    visible: document.visibilityState === 'visible' && typeof IntersectionObserver === 'undefined',
  })

  // Tokens are read after the frame re-renders with the new theme class.
  function readTheme() {
    const id = source.themeId()
    const frame = source.frame()
    context.theme = { id, scheme: themeMeta(id).mode, tokens: frame ? readThemeTokens(frame) : {} }
  }

  const onResize = () => {
    context.rootFontSize = rootFontSize()
  }
  let inViewport = typeof IntersectionObserver === 'undefined'
  let observer: IntersectionObserver | undefined
  const onVisibility = () => { context.visible = document.visibilityState === 'visible' && inViewport }
  watch(source.frame, (frame, previous) => {
    if (!observer) return
    if (previous) observer.unobserve(previous)
    inViewport = false
    onVisibility()
    if (frame) observer.observe(frame)
  }, { flush: 'post' })

  watch(
    () => [source.size().w, source.size().h] as const,
    ([w, h]) => {
      context.size = { w, h }
      context.sizeClass = sizeClass({ w, h })
    },
  )
  watch(source.config, (config) => {
    context.config = config
  })
  watch(source.variant, (variant) => {
    context.variant = variant
  })
  watch(source.contentScale, (contentScale) => {
    context.contentScale = contentScale
  })
  watch(source.focus, (focus) => {
    context.focus = focus
  })
  watch(source.frameMode, (frame) => {
    context.frame = frame
  })
  // `foreign` and the fonts can change the computed tokens without changing the id.
  // Post-flush reads the frame's updated class before the caller's nextTick resolves.
  watch(() => [source.themeId(), source.foreign(), source.fonts()] as const, readTheme, { flush: 'post' })
  onMounted(() => {
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        const entry = entries.find((entry) => entry.target === source.frame())
        if (!entry) return
        inViewport = entry.isIntersecting
        onVisibility()
      })
      const frame = source.frame()
      if (frame) observer.observe(frame)
    }
    onResize()
    readTheme()
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
  })
  onUnmounted(() => {
    observer?.disconnect()
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onVisibility)
  })
  return context
}
