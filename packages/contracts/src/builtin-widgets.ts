import type { WidgetSizing } from './grid.ts'
import type { WidgetPermission } from './widget-package.ts'
import type { SettingsSchema } from './widget-settings.ts'

/** A widget compiled into the app build. The API reads its grants here; there is no install screen. */
export interface BuiltinWidgetManifest {
  type: string
  title: string
  sizing: WidgetSizing
  permissions: readonly WidgetPermission[]
  settings?: SettingsSchema
}

export const BUILTIN_WIDGETS: readonly BuiltinWidgetManifest[] = [
  {
    type: 'placeholder',
    title: 'Placeholder',
    sizing: { default: { w: 4, h: 4 }, min: { w: 1, h: 1 }, max: { w: 24, h: 100 } },
    permissions: [],
  },
  {
    type: 'clock-analog-1',
    title: 'Clock: forest',
    sizing: { default: { w: 6, h: 6 }, min: { w: 4, h: 4 }, max: { w: 16, h: 16 } },
    permissions: [],
    // The zone list comes from the browser's Intl at run time, so `zone` is a plain string; the widget shows the system time for an unknown one.
    settings: {
      type: 'object',
      properties: {
        systemTime: { type: 'boolean', title: 'System time', default: true },
        notation: { type: 'string', title: 'Notation', default: 'UTC', enum: ['UTC', 'GMT'] },
        zone: { type: 'string', title: 'Time zone', default: 'UTC', maxLength: 64 },
      },
    },
  },
  // No settings schema: focus settings are global and live in the focus store.
  {
    type: 'pomodoro',
    title: 'Pomodoro',
    sizing: { default: { w: 6, h: 6 }, min: { w: 3, h: 3 }, max: { w: 12, h: 12 } },
    permissions: [],
  },
]

// A Map (not an object) so types like "toString" never resolve to prototype members.
const byType = new Map(BUILTIN_WIDGETS.map((manifest) => [manifest.type, manifest]))

export function findBuiltinWidget(type: string): BuiltinWidgetManifest | undefined {
  return byType.get(type)
}
