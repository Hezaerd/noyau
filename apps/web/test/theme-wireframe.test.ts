import { describe, expect, it } from "vite-plus/test"

import { NOYAU_THEME_PREVIEW_COLORS } from "../src/components/settings/theme-wireframe"

describe("theme wireframe palettes", () => {
  it("locks the Noyau light and dark preview tokens", () => {
    expect(NOYAU_THEME_PREVIEW_COLORS.light).toEqual({
      canvas: "#f5f4fb",
      sidebar: "#ebe9f4",
      sidebarAccent: "#ddd8f2",
      surface: "#ffffff",
      muted: "#efedf6",
      primary: "#6154e0",
    })
    expect(NOYAU_THEME_PREVIEW_COLORS.dark).toEqual({
      canvas: "#0f0f13",
      sidebar: "#0a0a0e",
      sidebarAccent: "#211f2b",
      surface: "#17171c",
      muted: "#202027",
      primary: "#9b8cff",
    })
  })
})
