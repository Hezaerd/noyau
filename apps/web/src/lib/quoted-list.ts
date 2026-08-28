export const formatQuotedList = (titles: ReadonlyArray<string>): string => {
  if (titles.length === 0) {
    return ""
  }
  if (titles.length === 1) {
    return `"${titles[0]}"`
  }
  const last = titles[titles.length - 1]
  const rest = titles
    .slice(0, -1)
    .map((title) => `"${title}"`)
    .join(", ")
  return `${rest} and "${last}"`
}
