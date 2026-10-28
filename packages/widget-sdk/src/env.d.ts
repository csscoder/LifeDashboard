// Resolved by the sandbox document's import map to the package's manifest.entry.
declare module '@lifedashboard/widget-entry' {
  const component: import('vue').Component
  export const modals: Record<string, import('vue').Component> | undefined
  export default component
}

declare module '*.css?raw' {
  const css: string
  export default css
}
