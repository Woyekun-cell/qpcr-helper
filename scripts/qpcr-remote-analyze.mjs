#!/usr/bin/env node
import { runRemoteAnalysisCommand } from "./lib/qpcr-remote-command.mjs";

try {
  const summary = await runRemoteAnalysisCommand({ argumentsList: process.argv.slice(2) });
  process.stdout.write(`${JSON.stringify({ status: "succeeded", ...summary })}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Remote qPCR analysis failed";
  process.stderr.write(`${JSON.stringify({ status: "failed", message })}\n`);
  process.exitCode = 1;
}
