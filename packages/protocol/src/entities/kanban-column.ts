import { KanbanColumnId, ProjectId } from "@noyau/protocol/ids"
import { Schema } from "effect"

const base62 = /^[\dA-Za-z]+$/
const smallestInteger = `A${"0".repeat(26)}`

/** Vérifie la grammaire canonique de rocicorp/fractional-indexing (alphabet base62 par défaut). */
export const isCanonicalFractionalIndex = (value: string): boolean => {
  if (!base62.test(value)) {
    return false
  }

  const head = value.charCodeAt(0)
  const integerLength =
    head >= 97 && head <= 122
      ? 2 + head - 97
      : head >= 65 && head <= 90
        ? 2 + 90 - head
        : 0

  if (integerLength === 0 || value.length < integerLength) {
    return false
  }

  const integer = value.slice(0, integerLength)
  if (integer === smallestInteger) {
    return false
  }

  const fractional = value.slice(integerLength)
  return fractional.length === 0 || !fractional.endsWith("0")
}

/** Clé d'ordre opaque. Seul le domaine calcule sa valeur entre deux voisins. */
export const KanbanRank = Schema.String.check(
  Schema.makeFilter(isCanonicalFractionalIndex, {
    expected: "a canonical base62 fractional index",
  }),
).pipe(Schema.brand("KanbanRank"))
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
