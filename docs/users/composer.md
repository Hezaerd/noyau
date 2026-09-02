# Use the composer

The composer is the prompt under a Thread. Use it to choose how the agent runs and to write your message.

## Keep multiple drafts

Choose **New Thread** whenever you want another unsent message. Each new composer is a separate draft, so you can move between drafts from the sidebar without losing their text. Drafts also appear in the Palette when you search for a word from their message.

Sending a draft creates its Thread. Your other drafts remain in the sidebar.

To remove a draft, open its sidebar menu, choose **Discard**, and confirm. Discarding removes only that draft and cannot be undone.

## Choose a model

Open the model control below the prompt. The left rail shows Favorites first, followed by each available provider. Choose a provider to see its models.

Choose the star beside a model to add it to Favorites. Favorite models also stay at the top of their provider's list. Choose the filled star again to remove the model from Favorites.

Older models appear under **Legacy models**. Choose that row to expand or collapse the older models. The row opens automatically when the Thread already uses a legacy model.

Type in the search field to search every available provider. Search results include legacy models even when their section is collapsed.

Choose the pin beside a model to make it the default for new Threads in the Project. Choose the filled pin again to remove the default.

## Choose model options

The controls below the prompt show the options supported by the selected model. Open **Service tier** to choose an available tier. To remove the override, choose the tier marked **Default**. If the provider does not name its default tier, choose the **Default** item instead.

## Choose a checkout and ref

The Git toolbar below the prompt stays visible with the composer. Use it to choose the current checkout or a worktree, then select the Git ref for the Thread.

## Mention files, Tickets, and skills

Type `@` to open a toolbar above the prompt and find Project files and Tickets. Choose a result to add it to the prompt as a chip.

With Codex selected, type `$` to open the toolbar for enabled skills that provide OpenAI interface metadata. Choose a skill to add its `$name` invocation as a chip. The chip keeps the skill's invocation in the message when you send it.

Press Backspace or Delete next to a chip to remove the whole mention. A `$name` that is not in the available skill list stays as ordinary text.

## Answer agent questions

When an agent needs several decisions, the composer shows one question at a time above the prompt. Choose an option or enter an Other answer, then use **Next** and **Back** to move through the batch. These buttons only change your draft.

Choose **Send answers** on the last question to send the complete batch. Your answers stay in place if sending fails, so you can retry. To leave without answering, choose **Interrupt** in the composer; this stops the waiting turn.

Noyau saves unfinished answer batches on this device. You can reload the app or move between Threads and return without losing selected options, Other answers, or your place in the batch.

If the provider session ends while a question is waiting, the saved batch remains above the composer. Review the answers and choose **Continue with answers**. Noyau starts a new Turn with the selected provider, model, access level, and checkout settings. The draft remains available until the continuation is durably recorded, so a failed attempt can be retried safely.

## Hide or show

On an open Thread:

1. Press **Mod+L**.
2. Or choose **Hide composer** in the Palette.
3. Or use the composer button in the Thread header.

The transcript uses the space the composer left. Text and images you already typed stay in the composer. Hiding it does not send or discard them.

## Continue from a response

Hover a completed agent response and choose **Fork from this response**. Noyau opens a new Thread with the conversation through that response, ready for your next message. The original Thread stays unchanged.

The action appears only when the selected provider can continue from that response. If Noyau cannot create the provider session, the new Thread shows the reason and links back to the original conversation.

## Reverse

Press **Mod+L** again, choose **Show composer** in the Palette, or use the same header button. Send and Interrupt live on the composer, so show it when you need them.

Settings → Keybindings lists this shortcut if you want to change it.
