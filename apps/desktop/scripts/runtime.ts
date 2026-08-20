import * as NodeServices from "@effect/platform-node/NodeServices"
import { ManagedRuntime } from "effect"

export const scriptRuntime = ManagedRuntime.make(NodeServices.layer)
