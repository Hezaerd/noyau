import type { MermaidConfig } from "@streamdown/mermaid"
import { Option, Schema } from "effect"

import type { ResolvedAppearance } from "@/lib/appearance"
import { threadMermaidPlugin } from "@/lib/thread-markdown-plugins"

const MermaidFailure = Schema.Struct({
  message: Schema.String,
})
const decodeMermaidFailure = Schema.decodeUnknownOption(MermaidFailure)

let mermaidRenderSeq = 0

export type MermaidRenderResult =
  | { readonly _tag: "ok"; readonly svg: string }
  | { readonly _tag: "error"; readonly message: string }

export const mermaidConfigForAppearance = (appearance: ResolvedAppearance): MermaidConfig => ({
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  securityLevel: "strict",
  startOnLoad: false,
  suppressErrorRendering: true,
  theme: appearance === "dark" ? "dark" : "default",
})

const mermaidFailureMessage = (failure: typeof MermaidFailure.Type): string => {
  const trimmed = failure.message.trim()
  return trimmed.length > 0 ? trimmed : "The diagram syntax is invalid."
}

export const renderThreadMermaidChart = async (
  chart: string,
  appearance: ResolvedAppearance,
): Promise<MermaidRenderResult> => {
  try {
    const result = await threadMermaidPlugin
      .getMermaid(mermaidConfigForAppearance(appearance))
      .render(`thread-md-mermaid-${String(++mermaidRenderSeq)}`, chart)
    return { _tag: "ok", svg: result.svg }
  } catch (error) {
    const failure = Option.getOrUndefined(decodeMermaidFailure(error))
    return {
      _tag: "error",
      message:
        failure === undefined ? "The diagram syntax is invalid." : mermaidFailureMessage(failure),
    }
  }
}
