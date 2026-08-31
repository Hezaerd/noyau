import {
  ProviderDriverKind,
  ProviderInstanceId,
  providerInstanceView,
} from "@noyau/contracts/entities/environment"
import { describe, expect, it } from "vite-plus/test"

import {
  isProviderInstanceReady,
  providerInstanceLabelOf,
  readyProviderIds,
} from "../src/lib/provider-presentation"
import { presentProviderInstanceConnection } from "../src/lib/providers-catalog"

const ready = providerInstanceView({
  instanceId: ProviderInstanceId.make("cursor"),
  driver: ProviderDriverKind.make("cursor"),
  enabled: true,
  probe: {
    installed: true,
    handshakeOk: true,
    version: "1",
    plan: null,
    binaryPath: "/bin/cursor-agent",
    models: [],
  },
})

const disabled = providerInstanceView({
  instanceId: ProviderInstanceId.make("claude"),
  driver: ProviderDriverKind.make("claude"),
  enabled: false,
  probe: {
    installed: true,
    handshakeOk: true,
    version: "1",
    plan: null,
    binaryPath: "/bin/claude",
    models: [],
  },
})

describe("provider presentation", () => {
  it("hides a disabled instance from new-Thread availability", () => {
    expect(isProviderInstanceReady(ready)).toBe(true)
    expect(isProviderInstanceReady(disabled)).toBe(false)
    expect(
      readyProviderIds({
        [ready.instanceId]: ready,
        [disabled.instanceId]: disabled,
      }),
    ).toEqual([ready.instanceId])
  })

  it("labels a second instance by driver and instance id", () => {
    const work = providerInstanceView({
      instanceId: ProviderInstanceId.make("claude-work"),
      driver: ProviderDriverKind.make("claude"),
      enabled: true,
    })
    expect(
      providerInstanceLabelOf(work.instanceId, {
        [work.instanceId]: work,
      }),
    ).toBe("Claude Code (claude-work)")
    expect(providerInstanceLabelOf(ready.instanceId, { [ready.instanceId]: ready })).toBe("Cursor")
  })

  it("presents a disabled instance without claiming the CLI is missing", () => {
    expect(presentProviderInstanceConnection(disabled)).toEqual({
      headline: "Disabled",
      detail: "Hidden from new Threads",
      statusDot: "disabled",
    })
  })
})
