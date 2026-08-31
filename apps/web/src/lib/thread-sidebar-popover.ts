import type { CursorModel, Provider } from "@noyau/contracts/entities/environment"
import type { ModelSelection } from "@noyau/contracts/entities/model-selection"

export const threadModelLabel = (
  modelSelection: ModelSelection | null,
  models: ReadonlyArray<Pick<CursorModel, "modelId" | "label">>,
): string => {
  if (modelSelection === null) {
    return "Auto"
  }
  return (
    models.find((model) => model.modelId === modelSelection.modelId)?.label ??
    modelSelection.modelId
  )
}

export const catalogModels = (
  provider: Provider,
  catalogs: Readonly<
    Record<string, ReadonlyArray<Pick<CursorModel, "modelId" | "label">> | undefined>
  >,
): ReadonlyArray<Pick<CursorModel, "modelId" | "label">> => catalogs[provider] ?? []
