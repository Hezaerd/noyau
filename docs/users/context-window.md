# See how full the context window is

The composer can show how much of the model's context window this Thread is using.

## Read the ring

1. Open a Thread that has already run at least one turn on Cursor or Codex.
2. Look to the left of Send. A ring appears once the provider reports fill.
3. Hover the ring to see tokens used and the window size, such as `12.4k / 200k`.

The ring is context fill, not a lifetime token bill. It stays on the Thread after the run ends, so you can still see how close the next turn is to the limit.

Claude Threads do not show a ring yet. A new Thread also hides it until a provider reports numbers.

## When it is missing

The ring hides when Noyau does not have a fill to show. There is nothing to turn off. After the next Cursor or Codex turn that reports usage, the ring comes back.
