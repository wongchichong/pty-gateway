# Roadmap — PTY Gateway Production Readiness

## Overview

**4 phases** | **15 requirements** | **Thorough timeline (2+ weeks)** | **Reliability-first priority**

Production readiness remediation for PTY Gateway. Each phase addresses a critical domain with observable success criteria.

---

## Phase 1: Security Fixes

**Goal**: Eliminate all security vulnerabilities blocking production deployment

**Requirements**: SEC-01, SEC-02, SEC-03 (removed), SEC-04

**Duration**: 3-5 days

### Success Criteria

1. ✅ No hardcoded secrets in any configuration file (grep search returns zero results)
2. ⚠️  Rate limiting removed (not needed for personal use)
3. ✅ Command validation active and verified (blocked command returns "not allowed")
4. ✅ Environment variable setup documented in OPERATIONS.md

### Tasks

**SEC-01: Remove hardcoded token from ecosystem.config.js**
- Replace `TELEGRAM_BOT_TOKEN: "8520957421:..."` with `process.env.TELEGRAM_BOT_TOKEN`
- Add environment variable validation on startup
- Test PM2 start with env vars: `TELEGRAM_BOT_TOKEN=xxx pm2 start`

**SEC-02: Remove hardcoded token from pty-gateway.service**
- Update systemd service to use `Environment="TELEGRAM_BOT_TOKEN=${TOKEN}"`
- Remove hardcoded value from service file
- Test systemd deployment with env vars

**SEC-03: Add rate limiting (REMOVED - not needed for personal use)**
- Removed from requirements
- Feature not implemented

**SEC-04: Add command validation**
- Create command whitelist array
- Validate first word of PTY command
- Return error for blocked commands
- Make whitelist configurable via `ALLOWED_COMMANDS` env var
- Test with blocked commands (e.g., `rm`, `sudo`)

### Dependencies

- None (can start immediately)

### Risks

- **Low**: Environment variable setup may confuse users → Mitigate with clear documentation
- **Low**: Command validation may block valid commands → Mitigate with configurable whitelist

---

## Phase 2: Reliability Fixes

**Goal**: Eliminate reliability bugs that could cause crashes or data corruption

**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05

**Duration**: 4-6 days

### Success Criteria

1. ✅ ID generation works correctly after restart (test restart with existing instances)
2. ✅ Memory usage stable with multiple sessions (monitor memory over 1 hour)
3. ✅ Auto-refresh timers stop on repeated errors (test with PTY service down)
4. ✅ File operations non-blocking (measure event loop lag)
5. ✅ Magic numbers extracted to configuration (grep search returns zero hardcoded values)

### Tasks

**REL-01: Fix ID counter bug**
- Change `parseInt(shortId, 36)` to `parseInt(shortId, 10)` in router.ts:75
- Test ID generation with existing instances
- Verify no collisions
- Update ID map persistence test

**REL-02: Add memory cleanup**
- Add `this.lastMessages.delete(sessionKey)` in `stopAutoRefresh()`
- Add `this.editCounters.delete(sessionKey)` in `stopAutoRefresh()`
- Add cleanup logging
- Test memory with 10+ sessions over 1 hour

**REL-03: Add timer error recovery**
- Add error counter in auto-refresh interval
- Stop timer after 3 consecutive errors
- Log error count and timer stop
- Test with PTY service unavailable

**REL-04: Use async fs operations**
- Replace `writeFileSync` with `await writeFile`
- Replace `readFileSync` with `await readFile`
- Add try-catch error handling
- Test file operations don't block

**REL-05: Extract magic numbers**
- Create constants: `AUTO_SNAPSHOT_DELAY`, `AUTO_REFRESH_INTERVAL`, `MAX_EDITS`
- Move to config or env vars
- Update all code references
- Document configuration options

### Dependencies

- Phase 1 complete (security fixes first)

### Risks

- **Medium**: ID counter fix may affect existing instances → Mitigate with migration test
- **Low**: Async fs operations may introduce race conditions → Mitigate with proper error handling

---

## Phase 3: Testing Fixes

**Goal**: Achieve 100% test pass rate with comprehensive integration tests

**Requirements**: TEST-01, TEST-02, TEST-03

**Duration**: 3-4 days

### Success Criteria

1. ✅ All 30 tests pass (100% pass rate, zero failures)
2. ✅ Integration tests cover key workflows (Connect→Snapshot→Send, Start→Auto-refresh→Kill)
3. ✅ Error scenarios tested (network failures, invalid inputs, command validation)
4. ✅ Test coverage > 80% (measured with vitest coverage)

### Tasks

**TEST-01: Fix test architecture**
- Create test helper for single session context
- Update `/snapshot` tests to use session from `/connect`
- Update auto-snapshot test to use session context
- Run full test suite, verify 30/30 pass

**TEST-02: Add integration tests**
- Add test: Connect → Snapshot → Send → Disconnect
- Add test: Start → Auto-refresh (30s) → Kill
- Add test: Size → Start → Verify PTY size
- Run integration tests, verify all pass

**TEST-03: Add error scenario tests**
- Add test: PTY service unavailable (network failure)
- Add test: Malformed commands (invalid input)
- Add test: Blocked command (command validation)
- Run error tests, verify proper error handling

### Dependencies

- Phase 2 complete (reliability fixes first, tests will validate fixes)

### Risks

- **Medium**: Test architecture changes may be complex → Mitigate with incremental approach
- **Low**: Integration tests may be slow → Mitigate with test timeouts

---

## Phase 4: Operations Updates

**Goal**: Update documentation and tooling for production deployment

**Requirements**: OPS-01, OPS-02, OPS-03

**Duration**: 2-3 days

### Success Criteria

1. ✅ OPERATIONS.md updated with environment variable setup (verified by reading doc)
2. ✅ Deployment checklist created and verified (walk through checklist steps)
3. ✅ Alerting integration working (test webhook sends alert)
4. ✅ Production deployment validated (deploy to production server, verify health)

### Tasks

**OPS-01: Update OPERATIONS.md**
- Add "Environment Variables" section
- Document required env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS`, `PTY_URL`
- Add secrets management best practices
- Update PM2/systemd setup instructions
- Add security checklist

**OPS-02: Create deployment checklist**
- Create DEPLOYMENT_CHECKLIST.md
- Add pre-deployment validation steps
- Add environment variable verification
- Add health check procedures
- Add rollback procedures
- Test checklist by walking through steps

**OPS-03: Set up alerting**
- Add Slack webhook support in monitor-gateway.ts
- Add Discord webhook support
- Configure alert threshold: queue > 5 messages
- Add `ALERT_WEBHOOK_URL` environment variable
- Test webhook with simulated alert
- Document alert setup in OPERATIONS.md

### Dependencies

- Phases 1-3 complete (all fixes validated before deployment)

### Risks

- **Low**: Documentation updates may be incomplete → Mitigate with checklist review
- **Low**: Alerting integration may require webhook setup → Mitigate with clear instructions

---

## Phase Execution Order

```
Phase 1: Security Fixes (3-5 days)
    ↓
Phase 2: Reliability Fixes (4-6 days)
    ↓
Phase 3: Testing Fixes (3-4 days)
    ↓
Phase 4: Operations Updates (2-3 days)
```

**Total Duration**: 12-18 days (2+ weeks)

**Execution Mode**: Sequential (dependencies between phases)

---

## Milestone: Production Deployment

**Trigger**: All 4 phases complete, all success criteria met

**Validation**:
- Run full test suite (30/30 pass)
- Run deployment checklist
- Deploy to production server
- Monitor for 24 hours
- Verify no incidents

**Success Criteria**:
- ✅ Zero security vulnerabilities
- ✅ Zero reliability bugs
- ✅ 100% test pass rate
- ✅ Production deployment successful
- ✅ 24-hour monitoring shows stability

---

## Risk Register

| Risk | Phase | Severity | Mitigation |
|------|-------|----------|------------|
| ID counter fix affects existing instances | Phase 2 | Medium | Test migration with existing instances |
| Test architecture changes complex | Phase 3 | Medium | Incremental approach, test each change |
| Environment variable setup confusion | Phase 1 | Low | Clear documentation with examples |
| Async fs race conditions | Phase 2 | Low | Proper error handling, testing |
| Documentation incomplete | Phase 4 | Low | Checklist review, peer review |
| Alerting webhook setup complexity | Phase 4 | Low | Clear instructions, test webhook |

---

## Requirement Coverage

**Total Requirements**: 15
**Mapped to Phases**: 15 (100% coverage)
**Unmapped Requirements**: 0

✅ All v1 requirements covered by phases

---

*Last updated: 2026-05-06*