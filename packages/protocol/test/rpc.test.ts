import { describe, expect, it } from "@effect/vitest"
import { ClientCommandRequest } from "@noyau/protocol/commands"
import {
  ControlPlaneRpcs,
  DispatchCommand,
  GetConfig,
  InspectProjectAgentIntegration,
  InstallProjectAgentIntegration,
  PreviewAttachment,
  PreviewFile,
  Probe,
  ProjectStreamItem,
  RemoveProjectAgentIntegration,
  RPC_METHODS,
  requiresFreshSnapshot,
  SearchWorkspacePaths,
  ShellStreamItem,
  SetShellFocus,
  SubscribeProject,
  SubscribeShell,
  SubscribeThread,
} from "@noyau/protocol/rpc"
import { Schema } from "effect"

describe("ControlPlaneRpcs", () => {
  it("expose les commandes, lectures et trois streams du control plane", () => {
    expect([...ControlPlaneRpcs.requests.keys()].toSorted()).toEqual(
      [
        RPC_METHODS.dispatchCommand,
        RPC_METHODS.subscribeProject,
        RPC_METHODS.subscribeShell,
        RPC_METHODS.subscribeThread,
        RPC_METHODS.setShellFocus,
        RPC_METHODS.previewFile,
        RPC_METHODS.inspectProjectAgentIntegration,
        RPC_METHODS.installProjectAgentIntegration,
        RPC_METHODS.removeProjectAgentIntegration,
        RPC_METHODS.previewAttachment,
        RPC_METHODS.getConfig,
        RPC_METHODS.probe,
        RPC_METHODS.searchWorkspacePaths,
        RPC_METHODS.vcsStatus,
        RPC_METHODS.vcsListRefs,
        RPC_METHODS.vcsSwitchRef,
        RPC_METHODS.vcsCreateRef,
        RPC_METHODS.vcsCreateWorktree,
        RPC_METHODS.gitDraft,
        RPC_METHODS.gitRunStackedAction,
      ].toSorted(),
    )
  })

  it("n'exporte plus les méthodes v1", () => {
    const keys = new Set(ControlPlaneRpcs.requests.keys())
    expect(keys.has("SubmitTicketCommand")).toBe(false)
    expect(keys.has("GetBoardSnapshot")).toBe(false)
    expect(keys.has("GetTicketActivity")).toBe(false)
    expect(keys.has("SubscribeProjectEvents")).toBe(false)
  })

  it("décode dispatchCommand sans identité cliente", () => {
    const payload = Schema.decodeSync(DispatchCommand.payloadSchema)({
      _tag: "project.create",
      commandId: "20000000-0000-4000-8000-000000000001",
      payload: {
        projectId: "10000000-0000-4000-8000-000000000001",
        name: "Noyau",
        workspaceRoot: "/Users/hezaerd/noyau",
      },
    })

    expect(payload._tag).toBe("project.create")
    expect(payload).not.toHaveProperty("actorId")
    expect(Schema.isSchema(ClientCommandRequest)).toBe(true)
  })

  it("décode getConfig et probe", () => {
    expect(Schema.decodeSync(GetConfig.payloadSchema)({})).toEqual({})
    expect(
      Schema.decodeSync(GetConfig.successSchema)({
        environmentId: "10000000-0000-4000-8000-000000000099",
        bundleVersion: "0.1.0",
        serverVersion: "0.1.0",
        databaseSchemaVersion: 1,
      }).databaseSchemaVersion,
    ).toBe(1)
    expect(Schema.decodeSync(Probe.payloadSchema)({})).toEqual({})
    expect(Schema.decodeSync(Probe.successSchema)({})).toEqual({})
  })

  it("décode workspace.searchPaths", () => {
    expect(
      Schema.decodeSync(SearchWorkspacePaths.payloadSchema)({
        projectId: "10000000-0000-4000-8000-000000000001",
        query: "adapter",
      }),
    ).toEqual({
      projectId: "10000000-0000-4000-8000-000000000001",
      query: "adapter",
    })
    expect(
      Schema.decodeSync(SearchWorkspacePaths.successSchema)({
        entries: [{ path: "src/adapter.ts", kind: "file" }],
      }),
    ).toEqual({
      entries: [{ path: "src/adapter.ts", kind: "file" }],
    })
  })

  it("décode afterSequence sur les trois subscribes", () => {
    expect(Schema.decodeSync(SubscribeShell.payloadSchema)({ afterSequence: 4 })).toEqual({
      afterSequence: 4,
    })
    expect(
      Schema.decodeSync(SubscribeProject.payloadSchema)({
        projectId: "10000000-0000-4000-8000-000000000001",
        afterSequence: 0,
      }).afterSequence,
    ).toBe(0)
    expect(
      Schema.decodeSync(SubscribeThread.payloadSchema)({
        threadId: "20000000-0000-4000-8000-000000000001",
      }),
    ).toEqual({
      threadId: "20000000-0000-4000-8000-000000000001",
    })
  })

  it("décode setShellFocus sans le persister comme Command", () => {
    expect(
      Schema.decodeSync(SetShellFocus.payloadSchema)({
        enabled: true,
        focus: {
          _tag: "thread",
          projectId: "10000000-0000-4000-8000-000000000001",
          threadId: "20000000-0000-4000-8000-000000000001",
        },
      }),
    ).toEqual({
      enabled: true,
      focus: {
        _tag: "thread",
        projectId: "10000000-0000-4000-8000-000000000001",
        threadId: "20000000-0000-4000-8000-000000000001",
      },
    })
    expect(Schema.decodeSync(SetShellFocus.successSchema)({})).toEqual({})
  })

  it("décode previewFile et ses trois kinds", () => {
    expect(
      Schema.decodeSync(PreviewFile.payloadSchema)({
        projectId: "10000000-0000-4000-8000-000000000001",
        path: "src/greet.py",
      }),
    ).toEqual({
      projectId: "10000000-0000-4000-8000-000000000001",
      path: "src/greet.py",
    })
    expect(
      Schema.decodeSync(PreviewFile.successSchema)({
        kind: "text",
        text: "print('salut')",
        truncated: false,
        mtimeMs: 1,
      }),
    ).toEqual({
      kind: "text",
      text: "print('salut')",
      truncated: false,
      mtimeMs: 1,
    })
    expect(
      Schema.decodeSync(PreviewFile.successSchema)({
        kind: "unsupported",
        reason: "binary",
        mtimeMs: 0,
      }).kind,
    ).toBe("unsupported")
    const image = Schema.decodeSync(PreviewFile.successSchema)({
      kind: "image",
      mime: "image/png",
      bytes: "iVBORw0KGgo=",
      mtimeMs: 2,
    })
    expect(image.kind).toBe("image")
    if (image.kind === "image") {
      expect(image.bytes).toBeInstanceOf(Uint8Array)
    }
  })

  it("décode les opérations d'Intégration agent", () => {
    const input = { projectId: "10000000-0000-4000-8000-000000000001" }
    expect(Schema.decodeSync(InspectProjectAgentIntegration.payloadSchema)(input)).toEqual(input)
    expect(Schema.decodeSync(InstallProjectAgentIntegration.payloadSchema)(input)).toEqual(input)
    expect(Schema.decodeSync(RemoveProjectAgentIntegration.payloadSchema)(input)).toEqual(input)
    expect(
      Schema.decodeSync(InspectProjectAgentIntegration.successSchema)({
        ...input,
        skillName: "noyau",
        targetPath: "/tmp/noyau/.agents/skills/noyau",
        currentVersion: "1.0.0",
        installedVersion: "0.9.0",
        status: "outdated",
      }).status,
    ).toBe("outdated")
  })

  it("décode previewAttachment", () => {
    expect(
      Schema.decodeSync(PreviewAttachment.payloadSchema)({
        attachmentId: "70000000-0000-4000-8000-000000000001-0",
      }),
    ).toEqual({
      attachmentId: "70000000-0000-4000-8000-000000000001-0",
    })
    const preview = Schema.decodeSync(PreviewAttachment.successSchema)({
      kind: "image",
      mime: "image/png",
      bytes: "iVBORw0KGgo=",
    })
    expect(preview.kind).toBe("image")
    expect(preview.bytes).toBeInstanceOf(Uint8Array)
  })

  it("demande un snapshot frais hors [0, 1000]", () => {
    expect(requiresFreshSnapshot(0)).toBe(false)
    expect(requiresFreshSnapshot(1000)).toBe(false)
    expect(requiresFreshSnapshot(-1)).toBe(true)
    expect(requiresFreshSnapshot(1001)).toBe(true)
  })

  it("round-trip un frame snapshot | event | synchronized", () => {
    const synchronized = Schema.decodeSync(ShellStreamItem)({
      kind: "synchronized",
    })
    expect(synchronized.kind).toBe("synchronized")

    const snapshot = Schema.decodeSync(ProjectStreamItem)({
      kind: "snapshot",
      snapshot: {
        snapshotSequence: 1,
        projectId: "10000000-0000-4000-8000-000000000001",
        project: {
          id: "10000000-0000-4000-8000-000000000001",
          name: "Noyau",
          workspaceRoot: "/tmp/noyau",
          available: true,
          createdAt: "2026-08-19T12:00:00.000Z",
          updatedAt: "2026-08-19T12:00:00.000Z",
        },
        columns: [],
        tickets: [],
        ticketDependencies: [],
        ticketThreads: [],
        ticketActivity: [],
      },
    })
    expect(snapshot.kind).toBe("snapshot")
  })
})
