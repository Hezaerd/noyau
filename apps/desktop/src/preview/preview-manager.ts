import { PREVIEW_GUEST_PARTITION } from "@noyau/shared/preview-url"
import type { Session } from "electron"

import {
  handlePreviewGuestNavigate,
  handlePreviewGuestWindowOpen,
  type PreviewWindowOpenResult,
} from "./preview-guest-policy.ts"

export type PreviewManager = {
  readonly dispose: () => void
}

export type PreviewGuestHost = {
  readonly getType: () => string
  readonly session: Pick<Session, "setPermissionCheckHandler" | "setPermissionRequestHandler">
  readonly setWindowOpenHandler: (
    handler: (details: { readonly url: string }) => PreviewWindowOpenResult,
  ) => void
  readonly on: (
    event: "will-navigate" | "will-redirect",
    listener: (event: { readonly preventDefault: () => void }, url: string) => void,
  ) => void
}

type PreviewSession = PreviewGuestHost["session"]

type PreviewCreatedEvent = {
  readonly preventDefault: () => void
}

export type PreviewApp = {
  readonly on: (
    event: "web-contents-created",
    listener: (event: PreviewCreatedEvent, contents: PreviewGuestHost) => void,
  ) => PreviewApp
  readonly off: (
    event: "web-contents-created",
    listener: (event: PreviewCreatedEvent, contents: PreviewGuestHost) => void,
  ) => PreviewApp
}

const denyGuestPermission = (): boolean => false

const blockGuestUrl = (event: { readonly preventDefault: () => void }, url: string): void => {
  handlePreviewGuestNavigate(url, () => {
    event.preventDefault()
  })
}

const lockGuestSession = (guestSession: PreviewSession): void => {
  guestSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })
  guestSession.setPermissionCheckHandler(denyGuestPermission)
}

export const attachPreviewGuest = (
  contents: PreviewGuestHost,
  openExternal: (url: string) => void,
): void => {
  if (contents.getType() !== "webview") {
    return
  }
  lockGuestSession(contents.session)
  contents.setWindowOpenHandler(({ url }) => handlePreviewGuestWindowOpen(url, openExternal))
  contents.on("will-navigate", blockGuestUrl)
  contents.on("will-redirect", blockGuestUrl)
}

/** Pose la politique des guests `<webview>` : http(s) only, pas de permission, `_blank` dehors. */
export const installPreviewManager = (input: {
  readonly app: PreviewApp
  readonly session: { readonly fromPartition: (partition: string) => PreviewSession }
  readonly openExternal: (url: string) => void
}): PreviewManager => {
  lockGuestSession(input.session.fromPartition(PREVIEW_GUEST_PARTITION))
  const onCreated = (_event: PreviewCreatedEvent, contents: PreviewGuestHost) => {
    attachPreviewGuest(contents, input.openExternal)
  }
  input.app.on("web-contents-created", onCreated)
  return {
    dispose: () => {
      input.app.off("web-contents-created", onCreated)
    },
  }
}
