import { KanbanColumnId, ProjectId } from "@noyau/protocol/ids"
import { Schema } from "effect"

/** Clé d'ordre opaque. Seul le domaine calcule sa valeur entre deux voisins. */
export const KanbanRank = Schema.NonEmptyString.pipe(Schema.brand("KanbanRank"))
export type KanbanRank = (typeof KanbanRank)["Type"]

/** Couleur CSS hexadécimale persistée pour l'identité visuelle d'une colonne. */
export const KanbanColumnColor = Schema.String.check(
  Schema.makeFilter((value) => /^#[\dA-Fa-f]{6}$/.test(value), {
    identifier: "KanbanColumnColor",
    description: "a six-digit hexadecimal color",
  }),
)
export type KanbanColumnColor = (typeof KanbanColumnColor)["Type"]

export class KanbanColumn extends Schema.Class<KanbanColumn>(
  "@noyau/protocol/entities/KanbanColumn",
)({
  id: KanbanColumnId,
  projectId: ProjectId,
  name: Schema.NonEmptyString,
  color: KanbanColumnColor,
  rank: KanbanRank,
  done: Schema.Boolean,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}
