// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test"

import {
  BOOT_SPLASH_ELEMENT_ID,
  bootSplashAssetPath,
  dismissBootSplash,
  resolveBootSplashChannel,
} from "../src/lib/boot-splash"

afterEach(() => {
  document.body.replaceChildren()
})

describe("boot splash", () => {
  it("résout le canal depuis le query et ignore une valeur inconnue", () => {
    expect(resolveBootSplashChannel("nightly")).toBe("nightly")
    expect(resolveBootSplashChannel("development")).toBe("development")
    expect(resolveBootSplashChannel("latest")).toBe("latest")
    expect(resolveBootSplashChannel("beta")).toBe("latest")
    expect(resolveBootSplashChannel(null)).toBe("latest")
  })

  it("pointe chaque canal vers son SVG public", () => {
    expect(bootSplashAssetPath("nightly")).toBe("/boot-splash-nightly.svg")
  })

  it("masque l'écran de démarrage s'il est monté", () => {
    const splash = document.createElement("div")
    splash.id = BOOT_SPLASH_ELEMENT_ID
    document.body.append(splash)

    dismissBootSplash()

    expect(splash.hasAttribute("hidden")).toBe(true)
  })

  it("ne lève pas si l'écran de démarrage est absent", () => {
    expect(() => dismissBootSplash()).not.toThrow()
  })
})
