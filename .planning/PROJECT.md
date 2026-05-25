# PTY Gateway Production Readiness

## What This Is

Production readiness remediation for PTY Gateway — a multi-platform messaging gateway connecting 22+ platforms (Telegram, Discord, WhatsApp, Slack, etc.) to PTY instances. Currently functional but has critical security vulnerabilities, reliability bugs, and testing gaps that block production deployment.

## Core Value

**Reliability and security must be guaranteed before production deployment.** The gateway works functionally, but cannot be trusted in production until critical issues are resolved.

## Requirements

### Validated

(None yet — fix issues to validate)

### Active

- [ ] Remove all hardcoded secrets from configuration files
- [ ] Fix ID counter persistence bug (base36 → decimal)
- [ ] Add memory cleanup to prevent unbounded map growth
- [ ] Add input validation for PTY commands
- [ ] Fix test architecture (single session tests)
- [ ] Add auto-refresh timer cleanup on errors
- [ ] Use async fs operations (non-blocking)
- [ ] Extract magic numbers to configuration
- [ ] Add integration tests for workflows
- [ ] Set up alerting integration (Slack/Discord)

### Out of Scope

- Webhook mode migration — deferred to future enhancement (requires public HTTPS endpoint)
- Multi-instance deployment — out of scope for single-server deployment
- Database-backed message persistence — current file-based approach sufficient for initial production
- Health dashboard UI — monitoring scripts provide sufficient visibility
- Performance optimization beyond memory cleanup — current performance acceptable

## Context

**Current State:**
- Gateway is functionally complete with 22+ messaging channels
- 83% test pass rate (25/30 tests) — failures are test architecture issues, not bugs
- Manual testing confirms all features work correctly
- PM2 and systemd configurations exist but have hardcoded secrets
- Comprehensive documentation (20+ files) and operational tooling in place

**Critical Issues Identified:**
1. **Security**: Hardcoded Telegram bot token in `ecosystem.config.js` and `pty-gateway.service`
2. **Reliability**: ID counter bug causes collisions after restart
3. **Reliability**: Memory leaks from unbounded maps
4. **Reliability**: Zombie auto-refresh timers on errors
5. **Security**: No input validation (command injection risk)
6. **Testing**: Test suite doesn't maintain session state

**Architecture:**
- TypeScript with strict mode enabled
- Clean separation: Router, Channel, PTY Client
- Plugin architecture for 22+ messaging channels
- Outbound-only connections (works behind firewalls)

## Constraints

- **Tech Stack**: TypeScript, Node.js, grammy (Telegram), discord.js — existing codebase
- **Timeline**: 2+ weeks for thorough remediation with full testing
- **Priority**: Reliability first, then security, then testing
- **Compatibility**: Must maintain backward compatibility with existing PTY service API
- **Deployment**: Single-server deployment with PM2 supervision
- **Resources**: No external dependencies (secrets management via environment variables)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Environment variables for secrets | Avoids hardcoded credentials, works with PM2/systemd, no external dependencies | — Pending |
| Decimal ID parsing (not base36) | Numeric IDs are decimal, base36 parsing causes collisions | — Pending |
| Memory cleanup on session end | Prevents unbounded map growth, avoids OOM crashes | — Pending |
| Command whitelist approach | Safer than sanitization, explicit allowed commands | — Pending |
| Single session test architecture | Matches actual usage, fixes test failures | — Pending |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-05-06 after initialization*
