import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { CommandId, ThreadId } from "@noyau/protocol/ids"
import { ThreadTurnStartRequest } from "@noyau/protocol/thread/commands"
import {
  parseBase64DataUrl,
  persistTurnUploads,
  readAttachmentPreview,
} from "@noyau/server/attachments"
import { Effect, FileSystem, Layer, Path } from "effect"

import { testServerConfigLayer } from "./fixtures.ts"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)
const commandId = "70000000-0000-4000-8000-000000000001"
const PNG_BYTES = Uint8Array.of(0x89, 0x50, 0x4e, 0x47)
const pngDataUrl = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`

const startRequest = ThreadTurnStartRequest.make({
  commandId: CommandId.make(commandId),
  payload: {
    threadId: ThreadId.make("20000000-0000-4000-8000-000000000001"),
    text: "Voici une capture",
    attachments: [
      {
        type: "image",
        name: "shot.png",
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
        dataUrl: pngDataUrl,
      },
    ],
  },
})

layer(platformLayer)("attachments", (it) => {
  it("parse un data URL image sans regex sur le payload", () => {
    assert.deepStrictEqual(parseBase64DataUrl(pngDataUrl), {
      mimeType: "image/png",
      base64: Buffer.from(PNG_BYTES).toString("base64"),
    })
    assert.isNull(parseBase64DataUrl("data:image/png,not-base64"))
  })

  it.effect("persiste l'upload hors journal et le relit", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const dataDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-attachments-",
      })
      const services = yield* Layer.build(testServerConfigLayer({ dataDirectory }))
      yield* Effect.gen(function* () {
        const persisted = yield* persistTurnUploads(startRequest)
        assert.strictEqual(persisted?.[0]?.id, `${commandId}-0`)
        assert.strictEqual(persisted?.[0]?.sizeBytes, PNG_BYTES.byteLength)
        const preview = yield* readAttachmentPreview(`${commandId}-0`)
        assert.strictEqual(preview.mime, "image/png")
        assert.deepStrictEqual(Array.from(preview.bytes), Array.from(PNG_BYTES))
      }).pipe(Effect.provide(services))
    }),
  )
})
