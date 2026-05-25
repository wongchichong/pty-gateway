# Requirements — PTY Gateway Production Readiness

## v1 Requirements (Production Blockers)

### Security

- [ ] **SEC-01**: Remove hardcoded Telegram bot token from ecosystem.config.js
  - Replace with environment variable `TELEGRAM_BOT_TOKEN`
  - Update PM2 configuration to use `process.env.TELEGRAM_BOT_TOKEN`
  - Document environment variable setup in OPERATIONS.md

- [ ] **SEC-02**: Remove hardcoded Telegram bot token from pty-gateway.service
  - Replace with systemd environment variable
  - Update service file to use `Environment="TELEGRAM_BOT_TOKEN=${TOKEN}"`
  - Add setup instructions for systemd deployment

- [x] **SEC-03**: Add rate limiting middleware (REMOVED - not needed for personal use)
  - Rate limiting was implemented but removed for personal use
  - Feature not needed for single-user deployment

- [ ] **SEC-04**: Add PTY command input validation
  - Implement command whitelist: `["ls", "pwd", "htop", "vim", "bash", "cat", "grep", "find", "echo", "clear"]`
  - Validate first word of command against whitelist
  - Return "Command not allowed" for blocked commands
  - Make whitelist configurable via environment variable

### Reliability

- [ ] **REL-01**: Fix ID counter persistence bug
  - Change `parseInt(shortId, 36)` to `parseInt(shortId, 10)` in router.ts:75
  - Test ID generation after restart
  - Verify no ID collisions with existing instances
  - Update ID map file format documentation

- [ ] **REL-02**: Add memory cleanup on session end
  - Clear `lastMessages` map entry in `stopAutoRefresh()`
  - Clear `editCounters` map entry in `stopAutoRefresh()`
  - Add cleanup logging for debugging
  - Test memory usage with multiple sessions

- [ ] **REL-03**: Add auto-refresh timer error recovery
  - Add error counter in auto-refresh interval
  - Stop timer after 3 consecutive errors
  - Log error count and timer stop
  - Test with simulated PTY failures

- [ ] **REL-04**: Use async fs operations
  - Replace `writeFileSync` with `writeFile` (async)
  - Replace `readFileSync` with `readFile` (async)
  - Wrap in try-catch with proper error handling
  - Test file operations don't block event loop

- [ ] **REL-05**: Extract magic numbers to configuration
  - Create constants: `AUTO_SNAPSHOT_DELAY = 500`, `AUTO_REFRESH_INTERVAL = 10000`
  - Move to configuration file or environment variables
  - Document configurable values
  - Update code references

### Testing

- [ ] **TEST-01**: Fix test architecture for session persistence
  - Create test helper that maintains single session
  - Update `/snapshot` tests to run in same session as `/connect`
  - Update auto-snapshot test to use session context
  - Verify all 30 tests pass (100% pass rate)

- [ ] **TEST-02**: Add integration tests for workflows
  - Test: Connect → Snapshot → Send → Disconnect
  - Test: Start → Auto-refresh → Kill
  - Test: Size → Start → Verify size
  - Add test coverage reporting

- [ ] **TEST-03**: Add error scenario tests
  - Test network failures (PTY service unavailable)
  - Test invalid inputs (malformed commands)
  - Test command validation blocking

### Operations

- [ ] **OPS-01**: Update OPERATIONS.md with environment variable setup
  - Document required environment variables
  - Add secrets management best practices
  - Include PM2 and systemd setup with env vars
  - Add security checklist

- [ ] **OPS-02**: Create deployment checklist
  - Pre-deployment validation steps
  - Environment variable verification
  - Health check procedures
  - Rollback procedures

- [ ] **OPS-03**: Set up alerting integration
  - Add Slack webhook support in monitor-gateway.ts
  - Add Discord webhook support
  - Configure alert thresholds (queue > 5 messages)
  - Document alert setup in OPERATIONS.md

---

## v2 Requirements (Post-Production Enhancements)

### Performance

- [ ] **PERF-01**: Add configurable auto-refresh interval
  - Allow users to set refresh interval (5s, 10s, 30s)
  - Add `/refresh` command to change interval
  - Store preference per session

- [ ] **PERF-02**: Optimize buffer comparison
  - Use hash comparison instead of full text comparison
  - Reduce memory usage for large buffers

### Features

- [ ] **FEAT-01**: Add resize on connect
  - Resize PTY to session size when connecting
  - Preserve user's size preference across connections

- [ ] **FEAT-02**: Add session persistence across restarts
  - Save session state to file
  - Restore sessions on gateway restart

---

## Out of Scope

### Deferred to Future Milestones

- **Webhook mode** — Requires public HTTPS endpoint, infrastructure changes. Current polling mode sufficient for single-server deployment.

- **Multi-instance deployment** — Load balancing and failover require infrastructure setup beyond current scope.

- **Database-backed message persistence** — File-based approach adequate for initial production. Database adds complexity without clear benefit.

- **Health dashboard UI** — Monitoring scripts (`monitor-gateway.ts`, `check-telegram-queue.ts`) provide sufficient visibility.

- **Performance optimization beyond memory cleanup** — Current performance acceptable. Optimize only if metrics show issues.

### Explicitly Excluded

- **Command sanitization via regex** — Whitelist approach is safer and more maintainable. Regex sanitization is fragile and error-prone.

- **Mock-based testing** — Integration tests against real PTY service are more valuable. Mocks would miss real-world issues (as seen in current test failures).

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SEC-01 | Phase 1: Security Fixes | Planned |
| SEC-02 | Phase 1: Security Fixes | Planned |
| SEC-03 | Phase 1: Security Fixes | Removed |
| SEC-04 | Phase 1: Security Fixes | Planned |
| REL-01 | Phase 2: Reliability Fixes | Planned |
| REL-02 | Phase 2: Reliability Fixes | Planned |
| REL-03 | Phase 2: Reliability Fixes | Planned |
| REL-04 | Phase 2: Reliability Fixes | Planned |
| REL-05 | Phase 2: Reliability Fixes | Planned |
| TEST-01 | Phase 3: Testing Fixes | Planned |
| TEST-02 | Phase 3: Testing Fixes | Planned |
| TEST-03 | Phase 3: Testing Fixes | Planned |
| OPS-01 | Phase 4: Operations Updates | Planned |
| OPS-02 | Phase 4: Operations Updates | Planned |
| OPS-03 | Phase 4: Operations Updates | Planned |

---

*Last updated: 2026-05-06*