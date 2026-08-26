import type { CursorModel, Provider } from "@noyau/protocol/entities/environment"
import type { DefaultModelSelection } from "@noyau/protocol/entities/model-selection"
import { Option, Schema } from "effect"

export interface FavoriteModel {
  readonly provider: Provider
  readonly modelId: string
}

export const MODEL_FAVORITES_STORAGE_KEY = "noyau:model-favorites"

const FavoriteModelSchema = Schema.Struct({
  provider: Schema.Literals(["cursor", "claude", "codex"]),
  modelId: Schema.NonEmptyString,
})
const FavoriteModelsJson = Schema.fromJsonString(Schema.Array(FavoriteModelSchema))
const decodeFavoriteModels = Schema.decodeUnknownOption(FavoriteModelsJson)
const encodeFavoriteModels = Schema.encodeSync(FavoriteModelsJson)

export const favoriteModelKey = (favorite: FavoriteModel): string =>
  `${favorite.provider}:${favorite.modelId}`

/** Résout le défaut d'un Brouillon sans réécrire la préférence durable du Project. */
export const resolveDraftDefaultModelSelection = (input: {
  readonly stored: DefaultModelSelection | null
  readonly availableProviders: ReadonlyArray<Provider>
  readonly modelsByProvider: Readonly<Record<Provider, ReadonlyArray<CursorModel>>>
}): DefaultModelSelection | null => {
  const provider =
    input.stored !== null && input.availableProviders.includes(input.stored.provider)
      ? input.stored.provider
      : input.availableProviders[0]
  if (provider === undefined) return null
  if (input.stored?.provider === provider) return input.stored
  const model = input.modelsByProvider[provider][0]
  return model === undefined ? null : { provider, modelSelection: { modelId: model.modelId } }
}

export const parseFavoriteModels = (value: string | null): ReadonlyArray<FavoriteModel> =>
  Option.getOrElse(decodeFavoriteModels(value ?? "[]"), () => [])

export const readStoredFavoriteModels = (): ReadonlyArray<FavoriteModel> => {
  try {
    return parseFavoriteModels(window.localStorage.getItem(MODEL_FAVORITES_STORAGE_KEY))
  } catch {
    return []
  }
}

export const persistFavoriteModels = (favorites: ReadonlyArray<FavoriteModel>): void => {
  try {
    if (favorites.length === 0) {
      window.localStorage.removeItem(MODEL_FAVORITES_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(MODEL_FAVORITES_STORAGE_KEY, encodeFavoriteModels(favorites))
  } catch {
    // Les favoris restent actifs pour cette session renderer si le stockage est indisponible.
  }
}
