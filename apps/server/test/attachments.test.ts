import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { assert, layer } from "@effect/vitest"
import { CommandId, ThreadId } from "@noyau/contracts/ids"
import { ThreadTurnStartRequest } from "@noyau/contracts/thread/commands"
import {
  parseBase64DataUrl,
  persistTurnUploads,
  readAttachmentPreview,
} from "@noyau/server/attachments"
import { Effect, FileSystem, Layer } from "effect"

import { testServerConfigLayer } from "./fixtures.ts"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)
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

  it("préserve un payload base64 de plusieurs MiB sans espaces", () => {
    const payload = "A".repeat(4 * 1024 * 1024)
    const parsed = parseBase64DataUrl(`data:image/png;base64,${payload}`)

    assert.strictEqual(parsed?.mimeType, "image/png")
    assert.strictEqual(parsed?.base64, payload)
  })

  it("respecte trim() autour du data URL et compacte les espaces autorisés", () => {
    assert.deepStrictEqual(parseBase64DataUrl(" \r\ndata:image/png;base64, \r\nAAAA \n BBBB \t"), {
      mimeType: "image/png",
      base64: "AAAABBBB",
    })
    assert.deepStrictEqual(parseBase64DataUrl("data:image/png;base64,==AA"), {
      mimeType: "image/png",
      base64: "==AA",
    })
  })

  it("rejette tabulation, caractère invalide, payload vide et payload compact non multiple de 4", () => {
    assert.isNull(parseBase64DataUrl("data:image/png;base64,AAAA\tBBBB"))
    assert.isNull(parseBase64DataUrl("data:image/png;base64,AAAA-BBBB"))
    assert.isNull(parseBase64DataUrl("data:image/png;base64,   "))
    assert.isNull(parseBase64DataUrl("data:image/png;base64, A AA"))
  })

  it("rejette un caractère invalide tardif dans un payload volumineux", () => {
    const payload = `${"A".repeat(1024 * 1024)}!`

    assert.isNull(parseBase64DataUrl(`data:image/png;base64,${payload}`))
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
