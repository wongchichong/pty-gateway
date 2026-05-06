---
status: resolved
trigger: Test failures from Phase 3 - 8 out of 23 tests failing
created: 2026-05-06T13:14:00Z
updated: 2026-05-06T13:29:00Z
---

# Debug Session: Test Failures

## Symptoms

**Expected behavior**: All 23 tests should pass

**Actual behavior**: 8 tests failing, 15 passing

**Error messages**:
1. `TypeError: this.bot.api.setMyCommands is not a function` (5 TelegramChannel tests)
2. `AssertionError: expected cols: 80, rows: 24 but got cols: 40, rows: 80` (/start command test)
3. `AssertionError: expected 'inst_1' but got '8: vim (PID 123, 80x24)'` (/list command test)
4. `AssertionError: expected send to be called but got 0 calls` (routes non-command input test)

**Timeline**: Tests started failing after Phase 1 and Phase 2 changes

**Reproduction**: Run `npm test`

## Current Focus

**hypothesis**: Multiple issues:
1. Mock bot API missing setMyCommands method
2. Test expectations don't match new channel defaults (40x80 for Telegram)
3. ID generation changed from base36 to decimal (Plan 02-01)
4. Rate limiting blocking test commands

**next_action**: Fix test harness to add setMyCommands mock and update test expectations

**evidence_needed**:
- Read test file to see mock implementation
- Check if rate limiting is interfering with tests
- Verify ID generation changes
- Check channel defaults

## Evidence

- timestamp: 2026-05-06T13:23:00Z
  observation: Test harness mock Bot class (line 20-34 in test-harness.ts) only has sendMessage and getMe in api object, missing setMyCommands
  file: /root/projects/pty-gateway/src/test-harness.ts

- timestamp: 2026-05-06T13:24:00Z
  observation: Router has channel-specific terminal defaults - Telegram: 40x80 (line 127 in router.ts)
  file: /root/projects/pty-gateway/src/router.ts

- timestamp: 2026-05-06T13:24:30Z
  observation: ID generation uses simple decimal counter (1, 2, 3...) not base36 (line 200 in router.ts)
  file: /root/projects/pty-gateway/src/router.ts

- timestamp: 2026-05-06T13:25:00Z
  observation: Rate limiting is active in test environment, blocking commands after rate limit exceeded
  file: /root/projects/pty-gateway/src/router.ts

## Eliminated

- ID generation base36 issue: Not the problem. toShortId generates numeric IDs and the /list format changed to show "shortId: name (PID pid, colsxrows)" not just "inst_1"

## Resolution

**root_cause**: Test suite outdated after Phase 1 and Phase 2 changes:
1. Missing `setMyCommands` mock in test harness causing 5 TelegramChannel test failures
2. Test expectation for /start command uses old terminal size (80x24) instead of new Telegram default (40x80)
3. /list test expects old format "inst_1" but new format is "shortId: name (PID pid, colsxrows)"
4. Rate limiting interferes with test execution, blocking commands after first few calls

**fix**:
1. Add `setMyCommands: vi.fn(async () => true)` to mock Bot.api object in test-harness.ts
2. Update /start test expectation to expect cols: 40, rows: 80
3. Update /list test to check for "vim" and "PID" in output instead of exact match
4. Mock rate limiter in tests to always return allowed: true
5. Change test command from "hello world" to "ls -la" (whitelisted command)

**verification**: All 23 tests passing after fixes

**files_changed**:
- src/test-harness.ts: Added setMyCommands mock and rate limiter mock
- src/index.test.ts: Updated test expectations and test commands
