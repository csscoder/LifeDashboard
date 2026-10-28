/** Normalize unsupported time zones to the manifest default. */
export function clockTimeZone(zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone }).resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

let cachedZone: string | undefined
let cachedFormat: Intl.DateTimeFormat | undefined

export function handAngles(date: Date, smooth = true, zone?: string) {
  let hours = date.getHours()
  let minute = date.getMinutes()
  if (zone !== undefined) {
    // Reuse the formatter while smooth hands update on every animation frame.
    if (cachedZone !== zone || !cachedFormat) {
      cachedFormat = new Intl.DateTimeFormat('en-GB', {
        timeZone: clockTimeZone(zone), hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
      })
      cachedZone = zone
    }
    const parts = cachedFormat.formatToParts(date)
    hours = Number(parts.find(part => part.type === 'hour')!.value)
    minute = Number(parts.find(part => part.type === 'minute')!.value)
  }
  const seconds = date.getSeconds() + (smooth ? date.getMilliseconds() / 1000 : 0)
  const minutes = minute + seconds / 60
  return {
    hour: ((hours % 12) + minutes / 60) * 30,
    minute: minutes * 6,
    second: seconds * 6,
  }
}
