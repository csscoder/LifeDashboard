import { describe, expect, it } from 'vitest'
import { BUILTIN_WIDGETS, findBuiltinWidget } from '../src/builtin-widgets.ts'
import { normalizeConfig, parseSettingsSchema } from '../src/widget-settings.ts'

describe('builtin widgets', () => {
  it('describes the placeholder without permissions', () => {
    expect(BUILTIN_WIDGETS.map((manifest) => manifest.type)).toEqual(['placeholder', 'clock-analog-1', 'pomodoro'])
    expect(findBuiltinWidget('placeholder')).toEqual({
      type: 'placeholder',
      title: 'Placeholder',
      sizing: { default: { w: 4, h: 4 }, min: { w: 1, h: 1 }, max: { w: 24, h: 100 } },
      permissions: [],
    })
  })

  it('describes the analog clock as a square widget without permissions', () => {
    expect(findBuiltinWidget('clock-analog-1')).toMatchObject({
      type: 'clock-analog-1',
      title: 'Clock: forest',
      sizing: { default: { w: 6, h: 6 }, min: { w: 4, h: 4 }, max: { w: 16, h: 16 } },
      permissions: [],
    })
  })

  it('gives the analog clock a valid time zone schema that defaults to the system time', () => {
    const settings = findBuiltinWidget('clock-analog-1')!.settings!
    expect(parseSettingsSchema(settings, [])).toEqual({ ok: true, value: settings })
    expect(normalizeConfig(settings, {}, new Set())).toEqual({ systemTime: true, notation: 'UTC', zone: 'UTC' })
  })

  it('describes the Pomodoro as a square widget with global settings', () => {
    expect(findBuiltinWidget('pomodoro')).toEqual({
      type: 'pomodoro',
      title: 'Pomodoro',
      sizing: { default: { w: 6, h: 6 }, min: { w: 3, h: 3 }, max: { w: 12, h: 12 } },
      permissions: [],
    })
  })

  it('never resolves prototype members', () => {
    expect(findBuiltinWidget('toString')).toBeUndefined()
    expect(findBuiltinWidget('constructor')).toBeUndefined()
  })
})
