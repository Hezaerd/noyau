const scrollToSettingsTarget = (target: HTMLElement): void => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "center",
  })
  target.focus({ preventScroll: true })
}

export function scrollToSettingsTargetId(targetId: string): boolean {
  const target = document.getElementById(targetId)
  if (target === null) {
    return false
  }
  scrollToSettingsTarget(target)
  return true
}

export { scrollToSettingsTarget }
