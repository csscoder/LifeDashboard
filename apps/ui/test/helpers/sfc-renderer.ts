import { readFileSync } from 'node:fs'
import { ModuleKind, transpileModule } from 'typescript'
import * as Vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { afterEach } from 'vitest'

export interface HostNode {
  readonly nodeName: string
  readonly nextElementSibling: HostNode | null
  tag: string
  text: string
  props: Record<string, any>
  children: HostNode[]
  parent: HostNode | null
  open: boolean
  focused: boolean
  isConnected: boolean
  showModal(): void
  close(): void
  style: Record<string, string>
  rect: { left: number; top: number; width: number; height: number }
  hidePopover(): void
  matches(selector: string): boolean
  dataset: Record<string, string>
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void
  dispatchEvent(event: Event): boolean
  click(): void
  focus(): void
  scrollIntoView(): void
  querySelectorAll(selector: string): HostNode[]
  querySelector(selector: string): HostNode | null
  closest(selector: string): HostNode | null
  getBoundingClientRect(): HostNode['rect']
}
const descendants = (el: HostNode): HostNode[] => [el, ...el.children.flatMap(descendants)]
const node = (tag: string, text = ''): HostNode => {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  return Vue.markRaw<HostNode>({
  tag, text, props: {}, children: [], parent: null, open: false, focused: false, style: {},
  rect: { left: 0, top: 0, width: 0, height: 0 },
  get nodeName() { return this.tag },
  get nextElementSibling() { const siblings = this.parent?.children ?? []; return siblings.slice(siblings.indexOf(this) + 1).find((n: HostNode) => !n.tag.startsWith('#')) ?? null },
  dataset: {},
  addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(listener) },
  removeEventListener(type, listener) { listeners.get(type)?.delete(listener) },
  dispatchEvent(event) {
    if (!event.target) Object.defineProperty(event, 'target', { configurable: true, value: this })
    Object.defineProperty(event, 'currentTarget', { configurable: true, value: this })
    const name = event.type[0]!.toUpperCase() + event.type.slice(1)
    for (const key of [`on${name}Capture`, `on${name}`]) {
      const handlers = this.props[key]
      for (const handler of Array.isArray(handlers) ? handlers : handlers ? [handlers] : []) handler(event)
    }
    for (const listener of listeners.get(event.type) ?? []) {
      if (typeof listener === 'function') listener.call(this, event); else listener.handleEvent(event)
    }
    if (event.bubbles && !event.cancelBubble && this.parent) this.parent.dispatchEvent(event)
    else if (event.bubbles && !event.cancelBubble && typeof window !== 'undefined') window.dispatchEvent?.(event)
    return !event.defaultPrevented
  },
  click() { if (this.props.disabled === undefined || this.props.disabled === false) this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })) },
  get isConnected() { return this.parent !== null },
  showModal() { this.open = true; this.focus() },
  close() { this.open = false; queueMicrotask(() => this.props.onClose?.(new Event('close'))) },
  hidePopover() { this.open = false },
  matches(selector) { return selector === ':popover-open' && this.open },
  focus() { this.focused = true; if (typeof document !== 'undefined' && 'activeElement' in document) {
    // The custom renderer has no browser focus manager.
    const descriptor = Object.getOwnPropertyDescriptor(document, 'activeElement')
    if (descriptor?.writable) (document as any).activeElement = this
  } this.dispatchEvent(new Event('focus')); this.dispatchEvent(new Event('focusin', { bubbles: true })) },
  scrollIntoView() {},
  querySelector(selector) {
    return this.children.flatMap(descendants).find(el => selector.startsWith('.')
      ? String(el.props.class ?? '').split(' ').includes(selector.slice(1)) : el.tag === selector) ?? null
  },
  querySelectorAll(selector) {
    const attribute = /^\[([\w-]+)\]$/.exec(selector)?.[1]
    return this.children.flatMap(descendants).filter(el => attribute ? el.props[attribute] !== undefined : el.tag === selector)
  },
  getBoundingClientRect() { return this.rect },
  // Only attribute selectors such as `[popover]`.
  closest(selector) {
    const attribute = /^\[([\w-]+)\]$/.exec(selector)?.[1]
    for (let el: HostNode | null = this; el; el = el.parent) if (attribute && el.props[attribute] !== undefined) return el
    return null
  },
})
}
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: node, createText: (text) => node('#text', text), createComment: (text) => node('#comment', text),
  setText: (el, text) => { el.text = text }, setElementText: (el, text) => { el.text = text; el.children = [] },
  patchProp: (el, key, _old, value) => { el.props[key] = value; if (key.startsWith('data-')) { const dataKey = key.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()); if (value === undefined || value === null) delete el.dataset[dataKey]; else el.dataset[dataKey] = String(value) } },
  parentNode: (el) => el.parent, nextSibling: (el) => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
  insert(el, parent, anchor) {
    if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1)
    const index = anchor ? parent.children.indexOf(anchor) : -1
    parent.children.splice(index < 0 ? parent.children.length : index, 0, el)
    el.parent = parent
  },
  remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
})
const apps: ReturnType<typeof renderer.createApp>[] = []
export function unmountComponents() { for (const app of apps.splice(0)) app.unmount() }
afterEach(unmountComponents)

export function compileSfc(url: URL, modules: Record<string, unknown>, runtime: typeof Vue = Vue): Vue.Component {
  const { descriptor } = parse(readFileSync(url, 'utf8'))
  const script = compileScript(descriptor, { id: 'component-test', inlineTemplate: true, templateOptions: { compilerOptions: { hoistStatic: false } } }).content
  const code = transpileModule(script, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: { default?: Vue.Component } = {}
  new Function('require', 'exports', code)((id: string) => {
    if (id === 'vue') return runtime
    if (!(id in modules)) throw new Error(`Unexpected import ${id}`)
    return modules[id]
  }, exports)
  return exports.default!
}

export function mountComponent(component: Vue.Component, initial: Record<string, any>, names: string[]) {
  const props = Vue.reactive(initial)
  const events: unknown[][] = []
  const listeners = Object.fromEntries(names.map(name => [
    `on${name[0]!.toUpperCase()}${name.slice(1)}`, (...args: unknown[]) => events.push([name, ...args]),
  ]))
  const root = node('root')
  const app = renderer.createApp({ render: () => Vue.h(component, { ...props, ...listeners }) })
  apps.push(app); app.mount(root)
  const nodes = () => descendants(root)
  const text = () => nodes().map(el => el.text).join(' ')
  const accessibleText = (el: HostNode): string => el.props['aria-hidden'] === 'true' ? '' : [el.text, ...el.children.map(accessibleText)].join(' ').replace(/\s+/g, ' ').trim()
  const button = (label: string) => nodes().find(el => el.tag === 'button' && (el.props['aria-label'] === label || accessibleText(el) === label))!
  return { props, events, nodes, text, button, panel: () => nodes().find(el => el.props.popover === 'auto')! }
}
