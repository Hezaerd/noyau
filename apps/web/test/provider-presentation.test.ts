import {
  ProviderDriverKind,
  ProviderInstanceId,
  providerInstanceView,
} from "@noyau/contracts/entities/environment"
import { describe, expect, it } from "vite-plus/test"

import {
  isProviderInstanceReady,
  providerInstanceLabelOf,
  providerModelLabelOf,
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
    models: [
      {
        modelId: "composer-2.5",
        label: "Composer 2.5",
        reasoningEfforts: [],
        serviceTiers: [],
      },
    ],
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

const codex = providerInstanceView({
  instanceId: ProviderInstanceId.make("codex"),
  driver: ProviderDriverKind.make("codex"),
  enabled: true,
  probe: {
    installed: true,
    handshakeOk: true,
    version: "1",
    plan: null,
    binaryPath: "/bin/codex",
    models: [
      {
        modelId: "gpt-5.6-luna",
        label: "GPT-5.6-Luna",
        reasoningEfforts: [],
        serviceTiers: [],
      },
    ],
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

  it("uses provider catalog labels for handoff models", () => {
    const providers = { [ready.instanceId]: ready, [codex.instanceId]: codex }

    expect(providerModelLabelOf(ready.instanceId, { modelId: "composer-2.5" }, providers)).toBe(
      "Composer 2.5",
    )
    expect(providerModelLabelOf(codex.instanceId, { modelId: "gpt-5.6-luna" }, providers)).toBe(
      "GPT-5.6-Luna",
    )
    expect(providerModelLabelOf(codex.instanceId, { modelId: "unknown-model" }, providers)).toBe(
      "unknown-model",
    )
    expect(providerModelLabelOf(codex.instanceId, null, providers)).toBe("Default model")
  })

  it("presents a disabled instance without claiming the CLI is missing", () => {
    expect(presentProviderInstanceConnection(disabled)).toEqual({
      headline: "Disabled",
      detail: "Hidden from new Threads",
      statusDot: "disabled",
    })
  })
})
