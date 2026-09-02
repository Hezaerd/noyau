# Review a pull request beside the Thread

The workspace panel can show and review the GitHub pull request for the open Thread without leaving Noyau.

## Open the pull request

On a Thread that already has a pull request:

1. Open the workspace panel, or press **Mod+Shift+B**.
2. Choose **Pull request** from the launcher cards. When another tab is already open, use the **+** menu beside the rightmost tab.
3. Or press **Mod+Shift+P**, pick **Open pull request** in the Palette, or select the **#N** badge on the Thread in the sidebar.

The tab shows the pull request for that Thread. If the Thread has none yet, the tab stays empty.

Press **Mod+Shift+C** on a Thread with an open pull request to copy its GitHub link. Noyau shows a **PR link copied** confirmation with the copied URL. You can also choose **Copy pull request link** in the Palette. The shortcut is available in Settings → Keybindings.

## Status and automatic settling

Noyau refreshes local Git status every 30 seconds. GitHub pull-request metadata is refreshed at most once every two minutes per worktree and branch, so a faster status refresh does not create a matching increase in GitHub requests.

If GitHub or `gh` is temporarily unavailable, Noyau keeps the last known pull-request state and retries with increasing delays. When the pull request reaches a closed or merged state, the Thread settles according to the automatic-settling setting.

## Read the pull request

The **Summary** tab shows the description, review activity, comments, and check status.

The **Timeline** tab orders the pull request opening, commits, reviews, and comments. Use the order control to show the newest or oldest activity first.

The **Code** tab shows the changed files. Choose **All commits** for the complete pull request, or choose one commit to inspect only that commit. The toolbar switches between unified and split diffs, wraps long lines, and expands or collapses every file.

The pull request header collapses after you scroll so the current tab keeps more room. Scroll back to the top to expand it again.

## Submit a review

Line comments are written against the complete pull request:

1. Open **Code** and choose **All commits**.
2. Expand a file.
3. Select a line number, then write the comment and choose **Add to review**.
4. Choose **Review**. Add an optional summary.
5. Choose **Comment**, **Approve**, or **Request changes**.

Line comments stay private in the tab until you submit the review. Remove a pending comment from its line to discard it. Close the review form to keep the draft and return to the diff.

Reload the tab to fetch a fresh pull-request viewer snapshot. The Thread status badge still uses its two-minute pull-request metadata cache, while local Git status refreshes independently. Closing the tab is the way out; hiding the panel keeps the tab.

## When it is missing

The tab needs GitHub CLI (`gh`) signed in on this machine, the same way creating a pull request does. If `gh` is missing or cannot see the pull request, the tab shows an error with retry and **Open on GitHub** actions.
