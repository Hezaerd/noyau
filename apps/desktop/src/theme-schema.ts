import { Schema } from "effect"

import { APPEARANCE_PREFERENCES } from "./theme"

export const AppearancePreferenceSchema = Schema.Literals(APPEARANCE_PREFERENCES)

export const decodeAppearancePreference = Schema.decodeUnknownEffect(AppearancePreferenceSchema)
