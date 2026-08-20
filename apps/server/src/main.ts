import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { Layer } from "effect"

import { serverLayer } from "./server"

Layer.launch(serverLayer).pipe(NodeRuntime.runMain)
