import { toastManager } from "@/components/ui/toast"
import { writeClipboardText } from "@/lib/clipboard"

const PR_LINK_COPIED_TOAST_ID = "thread-pr-link-copied"

export const copyPullRequestLink = async (url: string): Promise<void> => {
  try {
    await writeClipboardText(url)
    toastManager.add({
      description: url,
      id: PR_LINK_COPIED_TOAST_ID,
      title: "PR link copied",
      type: "success",
    })
  } catch {
    toastManager.add({
      description: "The clipboard refused the pull request link.",
      title: "Unable to copy PR link",
      type: "error",
    })
  }
}
