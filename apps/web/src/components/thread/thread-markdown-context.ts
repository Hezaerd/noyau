import type { ProjectId } from "@noyau/protocol/ids"
import { createContext, useContext } from "react"

import {
  emptyThreadMarkdownFileLinks,
  type ThreadMarkdownFileLinks,
} from "@/lib/markdown-file-links"

export type ThreadMarkdownContextValue = ThreadMarkdownFileLinks & {
  readonly projectId?: ProjectId | undefined
}

export const ThreadMarkdownContext = createContext<ThreadMarkdownContextValue>(
  emptyThreadMarkdownFileLinks(),
)

export const useThreadMarkdownFileLinks = (): ThreadMarkdownContextValue =>
  useContext(ThreadMarkdownContext)
