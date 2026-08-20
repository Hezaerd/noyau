import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { Layer } from "effect"

import { serverLayer } from "./server.ts"

Layer.launch(serverLayer).pipe(NodeRuntime.runMain)
