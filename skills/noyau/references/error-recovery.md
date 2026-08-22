# Error recovery

Treat Noyau rejections as authoritative domain feedback.

- Capability missing or tool absent: explain what cannot be done and continue without creating a
  shadow todo file.
- Board unavailable: retry one read after a short interval only when the user asked to continue;
  otherwise report the unavailable Project.
- Stale state, missing Ticket, or placement conflict: list again, recompute the intended mutation,
  then retry with current identifiers.
- Dependency cycle or open-prerequisite confirmation: do not bypass it silently.
- Authentication or MCP transport failure: ask the user to start a fresh Turn or restore the Noyau
  connection; never request the bearer token.

An operation is complete only after Noyau accepts it. Separate completed code work from a Ticket
status update that could not be persisted.
