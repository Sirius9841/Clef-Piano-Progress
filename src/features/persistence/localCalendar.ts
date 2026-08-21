export function localCalendarDateKey(timestamp: string, timeZone?: string): string {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) throw new RangeError(`Invalid timestamp: ${timestamp}`)
  const parts = new Intl.DateTimeFormat('en-US', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value
  const year = part('year')
  const month = part('month')
  const day = part('day')
  if (!year || !month || !day) throw new RangeError(`Could not resolve calendar date for: ${timestamp}`)
  return `${year}-${month}-${day}`
}
