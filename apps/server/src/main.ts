import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import { Layer } from "effect"

import { serverLayer } from "./server"

Layer.launch(serverLayer).pipe(BunRuntime.runMain)
