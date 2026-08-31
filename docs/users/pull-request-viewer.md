# Review a pull request beside the Thread

The workspace panel can show the GitHub pull request for the open Thread: description, reviews, changed files, and the diff.

## Open the pull request

On a Thread that already has a pull request:

1. Open the workspace panel, or press **Mod+Shift+B**.
2. Choose **Pull request** from the panel launcher or the **+** menu.
3. Or press **Mod+Shift+P**, pick **Open pull request** in the Palette, or select the **#N** badge on the Thread in the sidebar.

The tab shows the pull request for that Thread. If the Thread has none yet, the tab stays empty.

## Read description, reviews, and the diff

The **Conversation** section shows the title, state, branches, description, and the review timeline (approvals, change requests, and comments).

The **Files** section lists the changed paths. Select a path to jump to its diff.

This view is read-only. It does not approve, comment, or merge. Use **Open on GitHub** in the tab header when you need those actions on GitHub.

Reload the tab to fetch a fresh snapshot. Closing the tab is the way out; hiding the panel keeps the tab.

## When it is missing

The tab needs GitHub CLI (`gh`) signed in on this machine, the same way creating a pull request does. If `gh` is missing or cannot see the pull request, the tab shows an error instead of the conversation.
