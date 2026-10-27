// Workspace dates are YYYY-MM-DD strings in the Hermes Tasks time zone. They are computed in UTC from
// those strings and never from the machine clock, whose zone may differ.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function nextMonday(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, (8 - weekday) % 7 || 7)
}

/** «today», «tomorrow», «yesterday», «9 Oct» or «18 Mar 2027», plus « 19:00» for a timed due. */
export function formatDue(due: string, today: string): string {
  const date = due.slice(0, 10)
  const time = due.slice(11, 16)
  let day: string
  if (date === today) day = 'today'
  else if (date === addDays(today, 1)) day = 'tomorrow'
  else if (date === addDays(today, -1)) day = 'yesterday'
  else {
    const month = MONTHS[Number(date.slice(5, 7)) - 1]
    day = `${Number(date.slice(8, 10))} ${month}${date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${date.slice(0, 4)}`}`
  }
  return time ? `${day} ${time}` : day
}
