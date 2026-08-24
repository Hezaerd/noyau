import { describe, expect, it } from "vite-plus/test"

import {
  defaultDesktopUpdateChannel,
  parseDesktopUpdateChannelPreference,
} from "../src/lib/desktop-update-channel-preference"

describe("desktop update channel preference", () => {
  it("defaults to the packaged channel and accepts a stored override", () => {
    expect(defaultDesktopUpdateChannel("latest")).toBe("latest")
    expect(defaultDesktopUpdateChannel("nightly")).toBe("nightly")
    expect(defaultDesktopUpdateChannel("development")).toBe("latest")
    expect(parseDesktopUpdateChannelPreference(null, "nightly")).toBe("nightly")
    expect(parseDesktopUpdateChannelPreference("latest", "nightly")).toBe("latest")
    expect(parseDesktopUpdateChannelPreference("beta", "latest")).toBe("latest")
  })
})
