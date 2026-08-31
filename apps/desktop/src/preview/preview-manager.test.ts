import { describe, expect, it, vi } from "vite-plus/test"

import {
  attachPreviewGuest,
  installPreviewManager,
  type PreviewGuestHost,
} from "./preview-manager.ts"

const fakeContents = (
  type: string,
): PreviewGuestHost & {
  readonly emit: (
    event: "will-navigate" | "will-redirect",
    navigateEvent: { readonly preventDefault: () => void },
    url: string,
  ) => void
} => {
  const listeners = new Map<
    string,
    Set<(event: { readonly preventDefault: () => void }, url: string) => void>
  >()
  return {
    getType: () => type,
    session: {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    },
    setWindowOpenHandler: vi.fn(),
    on: (event, listener) => {
      const bucket = listeners.get(event) ?? new Set()
      bucket.add(listener)
      listeners.set(event, bucket)
    },
    emit: (event, navigateEvent, url) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(navigateEvent, url)
      }
    },
  }
}

describe("PreviewManager", () => {
  it("ignores non-webview contents", () => {
    const contents = fakeContents("window")
    attachPreviewGuest(contents, vi.fn())
    expect(contents.setWindowOpenHandler).not.toHaveBeenCalled()
  })

  it("locks a webview guest and blocks a file navigation", () => {
    const contents = fakeContents("webview")
    attachPreviewGuest(contents, vi.fn())
    expect(contents.session.setPermissionRequestHandler).toHaveBeenCalled()
    expect(contents.setWindowOpenHandler).toHaveBeenCalled()

    const preventDefault = vi.fn()
    contents.emit("will-navigate", { preventDefault }, "file:///tmp")
    expect(preventDefault).toHaveBeenCalledTimes(1)
    contents.emit("will-redirect", { preventDefault }, "javascript:alert(1)")
    expect(preventDefault).toHaveBeenCalledTimes(2)
  })

  it("installs the partition lock and can dispose the listener", () => {
    const guestSession = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    }
    const app = {
      on: vi.fn(() => app),
      off: vi.fn(() => app),
    }
    const manager = installPreviewManager({
      app,
      session: { fromPartition: () => guestSession },
      openExternal: vi.fn(),
    })
    expect(guestSession.setPermissionCheckHandler).toHaveBeenCalled()
    expect(app.on).toHaveBeenCalledWith("web-contents-created", expect.any(Function))
    manager.dispose()
    expect(app.off).toHaveBeenCalledWith("web-contents-created", expect.any(Function))
  })
})
