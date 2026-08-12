import { Context, Schema } from "effect"
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
} from "effect/unstable/httpapi"

import { TaskCommandRequest } from "./commands"
import { Task } from "./entities/task"
import { EventEnvelope } from "./events"
import { type ActorId, CommandId, EventId, ProjectId } from "./ids"
import { Receipt } from "./receipts"

/** Position de reprise opaque ; seul le control plane interprète son contenu. */
export const EventCursor = Schema.NonEmptyString.pipe(Schema.brand("EventCursor"))
export type EventCursor = (typeof EventCursor)["Type"]

export const ProjectTaskSnapshot = Schema.Struct({
  projectId: ProjectId,
  tasks: Schema.Array(Task),
  cursor: EventCursor,
})
export type ProjectTaskSnapshot = (typeof ProjectTaskSnapshot)["Type"]

export class InvalidRequest extends Schema.TaggedError<InvalidRequest>()(
  "InvalidRequest",
  {
    reason: Schema.NonEmptyString,
  },
  { httpApiStatus: 400 },
) {}

export class InvalidCausation extends Schema.TaggedError<InvalidCausation>()(
  "InvalidCausation",
  {
    causationId: EventId,
  },
  { httpApiStatus: 400 },
) {}

export class InvalidEventCursor extends Schema.TaggedError<InvalidEventCursor>()(
  "InvalidEventCursor",
  {
    cursor: Schema.String,
  },
  { httpApiStatus: 400 },
) {}

export class MissingIdentity extends Schema.TaggedError<MissingIdentity>()(
  "MissingIdentity",
  {},
  { httpApiStatus: 401 },
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  {},
  { httpApiStatus: 403 },
) {}

export class CommandIdConflict extends Schema.TaggedError<CommandIdConflict>()(
  "CommandIdConflict",
  {
    commandId: CommandId,
  },
  { httpApiStatus: 409 },
) {}

export class ServiceUnavailable extends Schema.TaggedError<ServiceUnavailable>()(
  "ServiceUnavailable",
  {
    service: Schema.NonEmptyString,
  },
  { httpApiStatus: 503 },
) {}

/** Identité vérifiée fournie aux handlers protégés. */
export class CurrentActor extends Context.Service<CurrentActor, ActorId>()(
  "@noyau/protocol/control-plane/CurrentActor",
) {}

/** Contrat d'identité ; l'app fournit l'adaptateur de développement ou de production. */
export class NoyauIdentity extends HttpApiMiddleware.Service<
  NoyauIdentity,
  { provides: CurrentActor }
>()("@noyau/protocol/control-plane/NoyauIdentity", {
  error: MissingIdentity,
  security: {
    actorId: HttpApiSecurity.apiKey({
      in: "header",
      key: "x-noyau-actor-id",
    }),
  },
}) {}

/** Transforme les erreurs de décodage HttpApi en erreur publique stable. */
export class RequestSchemaErrors extends HttpApiMiddleware.Service<RequestSchemaErrors>()(
  "@noyau/protocol/control-plane/RequestSchemaErrors",
  {
    error: InvalidRequest,
  },
) {}

export const LiveHealthResponse = Schema.Struct({
  status: Schema.Literal("live"),
})
export type LiveHealthResponse = (typeof LiveHealthResponse)["Type"]

export const ReadyHealthResponse = Schema.Struct({
  status: Schema.Literal("ready"),
})
export type ReadyHealthResponse = (typeof ReadyHealthResponse)["Type"]

/** Événement SSE avec curseur de reprise et EventEnvelope JSON typé. */
export const ProjectEvent = Schema.Struct({
  id: EventCursor,
  event: Schema.Literal("message"),
  data: Schema.fromJsonString(EventEnvelope),
})
export type ProjectEvent = (typeof ProjectEvent)["Type"]

/** Flux SSE dont chaque frame porte son EventCursor dans le champ `id`. */
export const ProjectEventStream = HttpApiSchema.StreamSse({
  events: ProjectEvent,
})

const projectParams = {
  projectId: ProjectId,
} as const

const identityErrors = [MissingIdentity, Forbidden, ServiceUnavailable] as const

export const ProjectApiGroup = HttpApiGroup.make("projects")
  .add(
    HttpApiEndpoint.post("submitTaskCommand", "/api/v1/projects/:projectId/commands", {
      params: projectParams,
      payload: TaskCommandRequest,
      success: Receipt,
      error: [
        InvalidRequest,
        InvalidCausation,
        MissingIdentity,
        Forbidden,
        CommandIdConflict,
        ServiceUnavailable,
      ],
    }),
    HttpApiEndpoint.get("getProjectTasks", "/api/v1/projects/:projectId/tasks", {
      params: projectParams,
      success: ProjectTaskSnapshot,
      error: identityErrors,
    }),
    HttpApiEndpoint.get("getProjectEvents", "/api/v1/projects/:projectId/events", {
      params: projectParams,
      query: {
        cursor: Schema.optionalKey(Schema.String),
      },
      headers: {
        "last-event-id": Schema.optionalKey(Schema.String),
      },
      success: ProjectEventStream,
      error: [InvalidEventCursor, MissingIdentity, Forbidden, ServiceUnavailable],
    }),
  )
  .middleware(NoyauIdentity)
  .middleware(RequestSchemaErrors)

export const HealthApiGroup = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("getLiveness", "/health/live", {
    success: LiveHealthResponse,
  }),
  HttpApiEndpoint.get("getReadiness", "/health/ready", {
    success: ReadyHealthResponse,
    error: ServiceUnavailable,
  }),
)

/** Contrat HTTP unique du control plane Noyau. */
export const ControlPlaneApi = HttpApi.make("NoyauControlPlaneApi").add(
  ProjectApiGroup,
  HealthApiGroup,
)
