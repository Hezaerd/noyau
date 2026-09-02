import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { createContext, useContext } from "react"

import type { ComposerTicket } from "@/lib/composer-tickets"
import {
  emptyThreadMarkdownFileLinks,
  type ThreadMarkdownFileLinks,
} from "@/lib/markdown-file-links"

export type ThreadMarkdownContextValue = ThreadMarkdownFileLinks & {
  readonly projectId?: ProjectId | undefined
  readonly threadId?: ThreadId | undefined
  readonly tickets?: ReadonlyArray<ComposerTicket> | undefined
  readonly onOpenTicket?: ((ticketId: string) => void) | undefined
}

export const ThreadMarkdownContext = createContext<ThreadMarkdownContextValue>(
  emptyThreadMarkdownFileLinks(),
)

export const useThreadMarkdownFileLinks = (): ThreadMarkdownContextValue =>
  useContext(ThreadMarkdownContext)
