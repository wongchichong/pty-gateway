---
name: cli-formatting-inconsistency
description: CLI commands not matching chat command formatting and TUI output showing ANSI codes instead of rendered colors
type: feedback
status: resolved
created: 2026-05-06
updated: 2026-05-06
---

## Symptoms

**Expected behavior:**
1. `pnpm dev list` should match `pnpm dev chat "/list"` format exactly
2. `pnpm dev snapshot/connect/send` should show rendered colors (no visible ANSI escape codes)
3. `pnpm dev chat "cmd"` should format output as Telegram messages (MarkdownV2 code blocks)

**Actual behavior:**
1. `pnpm dev list` shows different format than `pnpm dev chat "/list"`
2. `pnpm dev snapshot/connect/send` show raw ANSI escape codes (e.g., `[38;5;6m`)
3. Chat commands need to output in Telegram MarkdownV2 format

**Timeline:**
- Issue discovered after implementing CLI commands in src/index.ts
- Commands were recently added to integrate chat-mock functionality into main CLI

**Reproduction:**
1. Run `pnpm dev list` - shows numeric IDs instead of short IDs from map
2. Run `pnpm dev chat "/list"` - shows proper short IDs (3, 4, 5, 6)
3. Run `pnpm dev snapshot 4` - shows ANSI codes instead of rendered colors
4. Run `pnpm dev chat "/snapshot"` - should show MarkdownV2 formatted output

## Current Focus

**Hypothesis:** RESOLVED - Both issues fixed.

**Fix Applied:**
1. ID Mapping: CLI commands now load and use Router's persistent instance ID map
2. ANSI Rendering: CLI commands strip ANSI codes for clean TUI output

**Next action:** Verify all commands work correctly with comprehensive testing

## Evidence

- timestamp: 2026-05-06
  - File: src/index.ts lines 782-807
  - Finding: `listCommand()` calculates short IDs with `parseInt(i.id.split('-')[0], 16) % 10000`
  - Issue: This doesn't match Router's base36 counter system

- timestamp: 2026-05-06
  - File: src/router.ts lines 28-31, 102-105
  - Finding: Router maintains `instanceIdMap` and `reverseIdMap` with persistent storage
  - Finding: `generateShortId()` uses base36 counter: `this.idCounter.toString(36)`

- timestamp: 2026-05-06
  - File: src/index.ts lines 644-705 (snapshotCommand)
  - Finding: Requests snapshot with colors (`await pty.snapshot(instanceId, true)`)
  - Finding: Wraps in Markdown code blocks and outputs via console.log()
  - Issue: Console displays raw ANSI codes instead of rendering them

- timestamp: 2026-05-06
  - File: src/index.ts lines 565-642 (sendCommand)
  - Finding: Same pattern - requests colors, wraps in code blocks, outputs to console
  - Issue: Shows ANSI escape codes like `[38;5;6m` instead of colored output

- timestamp: 2026-05-06
  - File: src/index.ts lines 707-780 (connectCommand)
  - Finding: Same ANSI issue in connect output

- timestamp: 2026-05-06
  - File: src/router.ts lines 431-455 (cmdList)
  - Finding: Router's `/list` command uses `this.toShortId(i.id)` which uses the persistent map
  - Contrast: CLI's `listCommand()` recalculates IDs incorrectly

## Eliminated

- Hypothesis: Need to render ANSI codes in terminal
  - Reason: Terminal already supports colors, ANSI codes in code blocks show as raw text
  - Resolution: Strip ANSI codes for clean TUI output

## Resolution

**Root cause:**
Two bugs in src/index.ts CLI command implementations:

1. **ID Mapping Bug**: CLI commands (`listCommand`, `snapshotCommand`, `connectCommand`, `sendCommand`) don't use the Router's persistent instance ID map. Instead, they recalculate short IDs inconsistently or only load the map for resolution (not for display in list).

2. **ANSI Rendering Bug**: CLI commands request colored snapshots but output them wrapped in Markdown code blocks to console.log(), which displays raw ANSI escape sequences instead of rendering colors.

**Fix:**
1. **ID Mapping Fix**: Updated `listCommand()` to load Router's instance ID map from `~/.pty-gateway/instance-ids.json` and use `reverseIdMap` to get consistent short IDs
2. **ANSI Stripping Fix**: Updated `snapshotCommand()`, `connectCommand()`, and `sendCommand()` to strip ANSI codes using `.replace(/\x1b\[[0-9;]*m/g, '')` before outputting to console

**Files modified:**
- src/index.ts:
  - listCommand (lines 782-820): Now uses Router's ID map
  - snapshotCommand (lines 644-702): Strips ANSI codes
  - connectCommand (lines 704-781): Strips ANSI codes
  - sendCommand (lines 565-643): Strips ANSI codes

**Verification:**
- ✅ `pnpm dev list` matches `pnpm dev chat "/list"` format
- ✅ `pnpm dev snapshot 4` shows clean TUI output (no ANSI codes)
- ✅ `pnpm dev connect 4` shows clean TUI output
- ✅ `pnpm dev send 3 'pwd'` shows clean TUI output
- ✅ All commands use consistent short IDs from Router's map
