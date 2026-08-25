import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { initializeAppearance } from "@/lib/appearance"
import { initializeAutoRemoveMergedWorktreePreference } from "@/lib/auto-remove-merged-worktree-preference"
import { syncDocumentDesktopChrome } from "@/lib/desktop-bridge"
import { initializeDesktopUpdateChannelPreference } from "@/lib/desktop-update-channel-preference"
import { initializeDiscordPresencePreference } from "@/lib/discord-presence-preference"
import { initializeKeybindings } from "@/lib/keybindings"
import { initializeProjectFolderStartDirectory } from "@/lib/project-folder-preference"
import { initializeThreadEnvModePreference } from "@/lib/thread-env-mode-preference"
import { initializeTurnCuePreference } from "@/lib/turn-cue-preference"
import { AppAtomRegistryProvider } from "@/state/atom-registry"
import { initializeNowMinuteClock } from "@/state/now"
import { initializeThreadPins } from "@/state/thread-pins"
import { initializeThreadSettlePreference } from "@/state/thread-settle"
import { initializeThreadVisits } from "@/state/thread-visits"

import { routeTree } from "./routeTree.gen"

import "./index.css"

syncDocumentDesktopChrome()
initializeAppearance()
initializeKeybindings()
initializeProjectFolderStartDirectory()
initializeDiscordPresencePreference()
initializeDesktopUpdateChannelPreference()
initializeThreadEnvModePreference()
initializeAutoRemoveMergedWorktreePreference()
initializeThreadSettlePreference()
initializeTurnCuePreference()
initializeThreadPins()
initializeThreadVisits()
initializeNowMinuteClock()

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Élément #root introuvable")
}

createRoot(rootElement).render(
  <StrictMode>
    <AppAtomRegistryProvider>
      <TooltipProvider>
        <ToastProvider>
          <AnchoredToastProvider>
            <RouterProvider router={router} />
          </AnchoredToastProvider>
        </ToastProvider>
      </TooltipProvider>
    </AppAtomRegistryProvider>
  </StrictMode>,
)
