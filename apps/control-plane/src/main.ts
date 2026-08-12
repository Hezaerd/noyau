import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import { Layer } from "effect"

import { controlPlaneLayer } from "./server"

Layer.launch(controlPlaneLayer).pipe(BunRuntime.runMain)
