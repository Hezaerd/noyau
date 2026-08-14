interface AgentDebugEntry {
  readonly hypothesisId: string
  readonly location: string
  readonly message: string
  readonly data: Record<string, unknown>
  readonly timestamp: number
}

export const agentDebugLog = (entry: Omit<AgentDebugEntry, "timestamp">): void => {
  void fetch("/__agent-debug", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...entry, timestamp: Date.now() }),
    keepalive: true,
  })
}
