import { AttachmentId, ProviderSessionId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { resolveProviderTurnPrompt } from "@noyau/server/provider/undelivered-mandate"
import { describe, expect, it } from "vite-plus/test"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const firstTurn = TurnId.make("30000000-0000-4000-8000-000000000001")
const secondTurn = TurnId.make("30000000-0000-4000-8000-000000000002")
const resumeCursor = {
  schemaVersion: 1 as const,
  sessionId: ProviderSessionId.make("cursor-session-1"),
}
const timerPrompt = "Les timers sont buggé. Trouve la raison, fix et ouvre une PR"
const attachment = {
  type: "image" as const,
  id: AttachmentId.make("30000000-0000-4000-8000-000000000001-0"),
  name: "image.png",
  mimeType: "image/png" as const,
  sizeBytes: 128,
}

const priorUser = {
  _tag: "transcript.user" as const,
  threadId,
  turnId: firstTurn,
  text: timerPrompt,
  attachments: [attachment],
}

describe("resolveProviderTurnPrompt", () => {
  it("laisse le prompt courant si une session Cursor existe", () => {
    expect(
      resolveProviderTurnPrompt({
        resumeCursor,
        currentText: "Reprends",
        currentAttachments: undefined,
        currentTurnId: secondTurn,
        transcript: [priorUser],
      }),
    ).toEqual({ text: "Reprends", attachments: undefined })
  })

  it("remplace un jeton de reprise par le mandat non livré", () => {
    expect(
      resolveProviderTurnPrompt({
        resumeCursor: null,
        currentText: "Reprends",
        currentAttachments: undefined,
        currentTurnId: secondTurn,
        transcript: [priorUser],
      }),
    ).toEqual({ text: timerPrompt, attachments: [attachment] })
  })

  it("préfixe le mandat quand la session est neuve et le texte est nouveau", () => {
    expect(
      resolveProviderTurnPrompt({
        resumeCursor: null,
        currentText: "ouvre une PR",
        currentAttachments: undefined,
        currentTurnId: secondTurn,
        transcript: [priorUser],
      }),
    ).toEqual({
      text: `${timerPrompt}\n\nouvre une PR`,
      attachments: [attachment],
    })
  })

  it("ne se préfixe pas si le retry renvoie le même texte", () => {
    expect(
      resolveProviderTurnPrompt({
        resumeCursor: null,
        currentText: timerPrompt,
        currentAttachments: undefined,
        currentTurnId: secondTurn,
        transcript: [priorUser],
      }),
    ).toEqual({ text: timerPrompt, attachments: [attachment] })
  })
})
