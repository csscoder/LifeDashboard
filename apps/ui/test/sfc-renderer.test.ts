import { h } from 'vue'
import { expect, it } from 'vitest'
import { mountComponent } from './helpers/sfc-renderer'

it.each([false, true])('bubbles child clicks only when propagation is not stopped (%s)', stopped => {
  const calls: string[] = []
  const ui = mountComponent({ render: () => h('div', { onClick: () => calls.push('parent') }, [
    h('button', { onClick: (event: Event) => { calls.push('child'); if (stopped) event.stopPropagation() } }, 'Child'),
  ]) }, {}, [])
  ui.button('Child').click()
  expect(calls).toEqual(stopped ? ['child'] : ['child', 'parent'])
})
