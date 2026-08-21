import { blobatar } from "blobatar"

import { APP_ICON_NAME, APP_ICON_SIZE, APP_ICON_VARIANTS, type AppIconVariant } from "./app-icon.ts"

export const renderAppIconSvg = (variant: AppIconVariant): string =>
  blobatar(APP_ICON_NAME, {
    size: APP_ICON_SIZE,
    background: "square",
    contrast: false,
    palette: APP_ICON_VARIANTS[variant].palette,
  })
