/**
 * Shared output helpers for agent-friendly CLI.
 *
 * Conventions:
 * - Human text → stderr (progress, messages)
 * - Machine data → stdout (JSON, CSV, doc IDs)
 * - Exit codes: 0 = success, 1 = client/auth error, 2 = server error
 */

import { writeFileSync } from 'fs';
import { OkraRuntimeError } from '../errors';

/** Global flags propagated from program.opts(). */
export interface GlobalFlags {
  json?: boolean;
  quiet?: boolean;
  output?: string;
}

/** Write data to stdout or --output file. */
export function writeOutput(data: string, outputPath?: string): void {
  if (outputPath) {
    writeFileSync(outputPath, data);
    process.stderr.write(`Wrote → ${outputPath}\n`);
  } else {
    process.stdout.write(data + '\n');
  }
}

/** Progress message to stderr (suppressed by --quiet). */
export function progress(msg: string, quiet?: boolean): void {
  if (!quiet) process.stderr.write(msg + '\n');
}

/** Escape a value for CSV — wraps in quotes if it contains comma, quote, or newline. */
export function csvEscape(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Structured error handler — JSON to stderr when --json, exit with meaningful code. */
export function handleError(error: unknown, json?: boolean): never {
  const msg = error instanceof Error ? error.message : String(error);
  const status =
    error instanceof OkraRuntimeError ? error.status : 1;

  if (json) {
    process.stderr.write(JSON.stringify({ error: msg, code: status }) + '\n');
  } else {
    process.stderr.write(`Error: ${msg}\n`);
  }

  process.exit(status >= 500 ? 2 : 1);
}
