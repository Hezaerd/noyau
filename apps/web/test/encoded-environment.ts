const emptyProbe = {
  installed: false,
  handshakeOk: false,
  version: null,
  plan: null,
  binaryPath: null,
  models: [] as const,
}

export const encodedEmptyProviders = {
  cursor: {
    instanceId: "cursor",
    driver: "cursor",
    enabled: true,
    ...emptyProbe,
  },
  claude: {
    instanceId: "claude",
    driver: "claude",
    enabled: true,
    ...emptyProbe,
  },
  codex: {
    instanceId: "codex",
    driver: "codex",
    enabled: true,
    ...emptyProbe,
  },
}

export const encodedTestEnvironment = (input?: {
  readonly id?: string
  readonly createdAt?: string
  readonly cursorModels?: ReadonlyArray<unknown>
  readonly claudeModels?: ReadonlyArray<unknown>
  readonly codexModels?: ReadonlyArray<unknown>
}) => ({
  id: input?.id ?? "30000000-0000-4000-8000-000000000001",
  providers: {
    cursor: {
      ...encodedEmptyProviders.cursor,
      models: input?.cursorModels ?? [],
    },
    claude: {
      ...encodedEmptyProviders.claude,
      models: input?.claudeModels ?? [],
    },
    codex: {
      ...encodedEmptyProviders.codex,
      models: input?.codexModels ?? [],
    },
  },
  createdAt: input?.createdAt ?? "2026-08-25T12:00:00.000Z",
})
