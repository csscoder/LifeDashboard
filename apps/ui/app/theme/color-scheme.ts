import { readonly, ref, type Ref } from 'vue'
import type { ColorScheme } from './contract'

const scheme = ref<ColorScheme>('dark')
const sharedScheme = readonly(scheme)

if (typeof globalThis.matchMedia === 'function') {
  const media = globalThis.matchMedia('(prefers-color-scheme: dark)')
  scheme.value = media.matches ? 'dark' : 'light'
  media.addEventListener('change', (event) => {
    scheme.value = event.matches ? 'dark' : 'light'
  })
}

export function useColorScheme(): Readonly<Ref<ColorScheme>> {
  return sharedScheme
}
