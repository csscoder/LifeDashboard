import * as Vue from 'vue'
import { compileSfc } from './sfc-renderer'

// Each reka-ui select part renders as a host node named after it, with its props and attrs.
const part = (name: string) => Vue.defineComponent({ name, setup: (_, { slots }) => () => Vue.h(name, null, slots.default?.()) })
const reka = Object.fromEntries([
  'SelectRoot', 'SelectTrigger', 'SelectValue', 'SelectIcon', 'SelectPortal', 'SelectContent', 'SelectViewport',
  'SelectItem', 'SelectItemText', 'SelectItemIndicator',
].map((name) => [name, part(name)]))
export const UiSelect = compileSfc(new URL('../../app/ui/UiSelect.vue', import.meta.url), { 'reka-ui': reka })
