import { GlobeIcon } from "lucide-react"

import { BrowserView, type BrowserTabPayload } from "@/components/workspace-panel/BrowserView"
import { defineWorkspaceTab } from "@/components/workspace-panel/define-workspace-tab"
import { browserTabTitle, browserTabUrl } from "@/lib/browser-url"

/** Chrome d’un navigateur dans le panneau. Chaque ouverture est un onglet nouveau. */
export const browserWorkspaceTab = defineWorkspaceTab<"browser", BrowserTabPayload>({
  kind: "browser",
  label: "Browser",
  keepMounted: true,
  create: () => ({ url: null }),
  icon: GlobeIcon,
  titleOf: (tab) => browserTabTitle(browserTabUrl(tab.payload)),
  render: (context) => <BrowserView {...context} />,
})
