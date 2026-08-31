import {
  emptyEnvironmentProviders,
  Environment,
  ProviderInstanceId,
  type CursorModel,
} from "@noyau/contracts/entities/environment"
import { EnvironmentId } from "@noyau/contracts/ids"
import { Schema } from "effect"

const withModels = (
  providers: ReturnType<typeof emptyEnvironmentProviders>,
  instanceId: ProviderInstanceId,
  models: ReadonlyArray<CursorModel> | undefined,
) => {
  const current = providers[instanceId]
  if (current === undefined || models === undefined) {
    return providers
  }
  return {
    ...providers,
    [instanceId]: { ...current, models },
  }
}

export const encodedTestEnvironment = (input?: {
  readonly id?: string
  readonly createdAt?: string
  readonly cursorModels?: ReadonlyArray<CursorModel>
  readonly claudeModels?: ReadonlyArray<CursorModel>
  readonly codexModels?: ReadonlyArray<CursorModel>
}): typeof Environment.Encoded => {
  const providers = withModels(
    withModels(
      withModels(
        emptyEnvironmentProviders(),
        ProviderInstanceId.make("cursor"),
        input?.cursorModels,
      ),
      ProviderInstanceId.make("claude"),
      input?.claudeModels,
    ),
    ProviderInstanceId.make("codex"),
    input?.codexModels,
  )
  return Schema.encodeSync(Environment)(
    new Environment({
      id: EnvironmentId.make(input?.id ?? "30000000-0000-4000-8000-000000000001"),
      providers,
      createdAt: Schema.decodeSync(Schema.DateTimeUtcFromString)(
        input?.createdAt ?? "2026-08-25T12:00:00.000Z",
      ),
    }),
  )
}
