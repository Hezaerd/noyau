import type { ReleaseChannel } from "@noyau/shared/release-brand"
import { thinking } from "blobatar/expression"
import { _parts, serializeVars } from "blobatar/internal"

import { BOOT_SPLASH_SIZE } from "./boot-splash.ts"
import { BRAND_BLOBATAR_NAME, brandBlobatarPalette } from "./brand-blobatar.ts"

const escapeXmlAttribute = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")

/**
 * Self-contained splash mark: `_parts` + `thinking` + `motion.css` baked in.
 * Built for `<img>` — host CSS cannot reach SVG-as-image.
 */
export const renderBootSplashSvg = (channel: ReleaseChannel, motionCss: string): string => {
  const parts = _parts(BRAND_BLOBATAR_NAME, {
    size: BOOT_SPLASH_SIZE,
    background: "square",
    contrast: false,
    palette: brandBlobatarPalette(channel),
    animate: "always",
    expression: thinking,
    title: "Noyau",
  })
  const className = parts.cls ?? "mo-root mo-always"
  const style =
    parts.vars === undefined ? "" : ` style="${escapeXmlAttribute(serializeVars(parts.vars))}"`
  const background =
    parts.bg === undefined ? "" : `<path d="${parts.bg.d}" fill="${parts.bg.fill}"/>`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${String(BOOT_SPLASH_SIZE)}" height="${String(BOOT_SPLASH_SIZE)}"${style}>`,
    `<style><![CDATA[${motionCss}]]></style>`,
    `<title>Noyau</title>`,
    background,
    `<g class="${className}">${parts.inner}</g>`,
    `</svg>`,
    "",
  ].join("")
}
