const dateTimeFormatterOptions = {
  dateStyle: "medium",
  timeStyle: "short",
} as const satisfies Intl.DateTimeFormatOptions

let dateTimeFormatter: Intl.DateTimeFormat | undefined

const getDateTimeFormatter = (): Intl.DateTimeFormat => {
  dateTimeFormatter ??= new Intl.DateTimeFormat(undefined, dateTimeFormatterOptions)
  return dateTimeFormatter
}

export const formatDateTime = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : getDateTimeFormatter().format(date)
}
