import { describe, expect, it } from "vite-plus/test"

import { applicationMenuTemplate } from "./application-menu"

describe("desktop application menu", () => {
  it("keeps edit and window roles on every platform", () => {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      const roles = applicationMenuTemplate(platform, "Noyau").map((item) => item.role)
      expect(roles).toContain("editMenu")
      expect(roles).toContain("windowMenu")
    }
  })

  it("does not restore Electron's default File/View/Help chrome", () => {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      const roles = applicationMenuTemplate(platform, "Noyau").map((item) => item.role)
      expect(roles).not.toContain("fileMenu")
      expect(roles).not.toContain("viewMenu")
      expect(roles).not.toContain("help")
    }
  })

  it("prefixes the branded app menu on macOS only", () => {
    const darwin = applicationMenuTemplate("darwin", "Noyau (Nightly)")
    expect(darwin[0]).toMatchObject({
      label: "Noyau (Nightly)",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    })
    expect(applicationMenuTemplate("win32", "Noyau")[0]?.role).toBe("editMenu")
  })
})
