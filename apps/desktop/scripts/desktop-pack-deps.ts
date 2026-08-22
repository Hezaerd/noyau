// Le paquet npm `electron` exporte un stub Node (chemin du binaire + install.js).
// L'API réelle est fournie par le process Electron. L'inliner dans main/preload
// relance `execPath …/dist-electron/install.js` et ouvre le dialog
// "Unable to find Electron app".
export const desktopPackNeverBundle = ["electron"] as const

export const isDesktopAlwaysBundled = (id: string): boolean =>
  id.startsWith("@noyau/") ||
  id === "effect" ||
  id.startsWith("@effect/") ||
  id.startsWith("effect/")
