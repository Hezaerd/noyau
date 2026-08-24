import { describe, expect, it } from "@effect/vitest"

import {
  encodePreloadBootstrapArgs,
  PRELOAD_APP_VERSION_ARG,
  PRELOAD_RELEASE_CHANNEL_ARG,
  readPreloadBootstrapFromArgv,
} from "./preload-bootstrap.ts"

describe("preload bootstrap argv", () => {
  it("round-trips channel and version through additionalArguments", () => {
    const encoded = encodePreloadBootstrapArgs({
      releaseChannel: "nightly",
      appVersion: "1.2.3-nightly.4",
    })
    expect(encoded).toEqual([
      `${PRELOAD_RELEASE_CHANNEL_ARG}=nightly`,
      `${PRELOAD_APP_VERSION_ARG}=1.2.3-nightly.4`,
    ])
    expect(readPreloadBootstrapFromArgv(["electron", ...encoded])).toEqual({
      releaseChannel: "nightly",
      appVersion: "1.2.3-nightly.4",
    })
  })

  it("percent-encodes characters that would break argv splitting", () => {
    const encoded = encodePreloadBootstrapArgs({
      releaseChannel: "development",
      appVersion: "0.0.0+local build",
    })
    expect(encoded[1]).toBe(`${PRELOAD_APP_VERSION_ARG}=0.0.0%2Blocal%20build`)
    expect(readPreloadBootstrapFromArgv(encoded)).toEqual({
      releaseChannel: "development",
      appVersion: "0.0.0+local build",
    })
  })

  it("fails closed when main forgot to push bootstrap args", () => {
    expect(() => readPreloadBootstrapFromArgv(["electron"])).toThrow(
      /Missing --noyau-release-channel/,
    )
    expect(() => readPreloadBootstrapFromArgv([`${PRELOAD_RELEASE_CHANNEL_ARG}=latest`])).toThrow(
      /Missing --noyau-app-version/,
    )
  })

  it("rejects an invalid release channel the same way as the old sync IPC path", () => {
    expect(() =>
      readPreloadBootstrapFromArgv([
        `${PRELOAD_RELEASE_CHANNEL_ARG}=beta`,
        `${PRELOAD_APP_VERSION_ARG}=1.0.0`,
      ]),
    ).toThrow(/Invalid release channel/)
  })
})
