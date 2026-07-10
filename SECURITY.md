# Security Policy

## Stop hook trust model

The Claude Code Stop hook executes only the installed `record-trace.mjs` script, either from the plugin or a vendored skill copy. It reads the local hook payload from stdin, opens the transcript path supplied by Claude Code, reads that local JSONL transcript, and writes trace events to one local JSONL file under the configured repo metrics directory. It makes no network calls, uses no dependencies beyond Node built-ins, catches all top-level errors, and always exits 0.

## What rule-trace does not touch

The recorder does not read credentials or environment secrets. It writes only under the configured `--root`/project metrics directory and reads only the transcript path handed to it by the hook plus local rule-trace config needed to find the metrics file.

## Reporting vulnerabilities

Please report security issues privately through GitHub Security Advisories for this repository. Expect acknowledgment within 7 days, followed by coordination on impact, fix timing, and disclosure.
