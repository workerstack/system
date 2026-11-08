#!/usr/bin/env bun
import { main } from "./main.ts"
import { nodeRuntime } from "./runtime.ts"

process.exit(await main(process.argv.slice(2), nodeRuntime()))
