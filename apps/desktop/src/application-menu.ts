import type { MenuItemConstructorOptions } from "electron"

const editAndWindowMenus = [
  { role: "editMenu" },
  { role: "windowMenu" },
] as const satisfies ReadonlyArray<MenuItemConstructorOptions>

/**
 * Slim native menu: keep Edit/Window roles so Cmd/Ctrl+A/C/V/X/Z work.
 * Electron's default File/View/Help chrome stays out.
 */
export const applicationMenuTemplate = (
  platform: NodeJS.Platform,
  appName: string,
): MenuItemConstructorOptions[] => {
  if (platform !== "darwin") {
    return [...editAndWindowMenus]
  }

  return [
    {
      label: appName,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    ...editAndWindowMenus,
  ]
}
