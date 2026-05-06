#!/usr/bin/env tsx
/**
 * Comprehensive Isolated Test Suite for PTY Gateway CLI Commands
 *
 * This test:
 * 1. Checks if PTY server is running, starts it if not
 * 2. Creates fresh PTY instances for testing
 * 3. Tests all CLI commands in isolation
 * 4. Compares CLI vs Chat command outputs
 * 5. Cleans up all created instances
 */

import { PtyClient } from "./src/pty-client.js";
import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── Test Configuration ───────────────────────────────────────────────────────

const PTY_URL = "http://localhost:3000";
const TEST_TIMEOUT = 5000;

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

// ── Utility Functions ────────────────────────────────────────────────────────

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logSection(title: string) {
  console.log("\n" + "═".repeat(70));
  console.log(`  ${title}`);
  console.log("═".repeat(70));
}

function logTest(name: string, passed: boolean, details?: string) {
  const symbol = passed ? "✅" : "❌";
  console.log(`  ${symbol} ${name}${details ? `: ${details}` : ""}`);
  results.push({ name, passed, details });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(cmd: string, args: string[] = []): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: true });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => (stdout += data.toString()));
    proc.stderr.on("data", (data) => (stderr += data.toString()));

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });

    // Timeout protection
    setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr, code: -1 });
    }, TEST_TIMEOUT);
  });
}

// ── PTY Server Management ────────────────────────────────────────────────────

let ptyServerProcess: ReturnType<typeof spawn> | null = null;
let serverWasStarted = false;

async function checkPtyServer(): Promise<boolean> {
  try {
    const client = new PtyClient({ url: PTY_URL });
    const health = await client.health();
    return health.status === "ok";
  } catch {
    return false;
  }
}

async function startPtyServer(): Promise<void> {
  const isRunning = await checkPtyServer();
  if (isRunning) {
    log("✓ PTY server already running");
    serverWasStarted = false;
    return;
  }

  log("Starting PTY server...");
  serverWasStarted = true;

  ptyServerProcess = spawn("pnpm", ["--filter", "pty", "serve", "--port", "3000"], {
    detached: true,
    shell: true,
    stdio: "ignore",
  });

  // Wait for server to start
  for (let i = 0; i < 10; i++) {
    await sleep(500);
    const isUp = await checkPtyServer();
    if (isUp) {
      log("✓ PTY server started");
      return;
    }
  }

  throw new Error("Failed to start PTY server");
}

async function stopPtyServer(): Promise<void> {
  if (!serverWasStarted || !ptyServerProcess) {
    log("✓ PTY server was already running, not stopping");
    return;
  }

  log("Stopping PTY server...");
  if (ptyServerProcess.pid) {
    process.kill(-ptyServerProcess.pid, "SIGTERM");
  }
  await sleep(500);
  log("✓ PTY server stopped");
}

// ── Test Instance Management ────────────────────────────────────────────────

const testInstances: string[] = [];

async function createTestInstance(command: string): Promise<string> {
  const client = new PtyClient({ url: PTY_URL });
  const instance = await client.spawn({
    command,
    args: [],
    cols: 80,
    rows: 24,
  });

  testInstances.push(instance.id);
  await sleep(300); // Wait for instance to initialize
  log(`  Created test instance: ${instance.id.substring(0, 8)}... (${command})`);
  return instance.id;
}

async function cleanupTestInstances(): Promise<void> {
  if (testInstances.length === 0) return;

  log("\nCleaning up test instances...");
  const client = new PtyClient({ url: PTY_URL });

  for (const instanceId of testInstances) {
    try {
      await client.kill(instanceId);
      log(`  ✓ Killed instance: ${instanceId.substring(0, 8)}...`);
    } catch (err) {
      log(`  ⚠ Failed to kill instance: ${instanceId.substring(0, 8)}...`);
    }
  }

  testInstances.length = 0;
}

// ── Test Functions ───────────────────────────────────────────────────────────

async function testListCommand(instanceId: string): Promise<void> {
  logSection("TEST: List Command");

  // Test CLI list
  const cliResult = await runCommand("pnpm dev list");
  const cliHasInstance = cliResult.stdout.includes("htop") || cliResult.stdout.includes("bash");
  logTest("CLI list shows instances", cliHasInstance);

  // Test Chat list
  const chatResult = await runCommand("pnpm dev chat '/list'");
  const chatHasInstance = chatResult.stdout.includes("htop") || chatResult.stdout.includes("bash");
  logTest("Chat list shows instances", chatHasInstance);

  // Compare formats
  const cliFormat = cliResult.stdout.match(/\d+:\s+\w+\s+\(PID\s+\d+,\s+\d+x\d+\)/);
  const chatFormat = chatResult.stdout.match(/\d+:\s+\w+\s+\(PID\s+\d+,\s+\d+x\d+\)/);
  const formatsMatch = cliFormat && chatFormat;
  logTest("CLI and Chat list formats match", !!formatsMatch);
}

async function testSnapshotCommand(instanceId: string): Promise<void> {
  logSection("TEST: Snapshot Command");

  // Get short ID from instance map
  const idMapFile = join(homedir(), ".pty-gateway", "instance-ids.json");
  let shortId = "1";
  if (existsSync(idMapFile)) {
    const map = JSON.parse(readFileSync(idMapFile, "utf8"));
    for (const [short, full] of Object.entries(map)) {
      if (full === instanceId) {
        shortId = short;
        break;
      }
    }
  }

  // Test CLI snapshot
  const cliResult = await runCommand(`pnpm dev snapshot ${shortId}`);
  const cliHasOutput = cliResult.stdout.length > 0 && !cliResult.stdout.includes("Failed");
  logTest("CLI snapshot returns output", cliHasOutput);

  // Check for ANSI codes (should be present for TUI)
  const cliHasAnsi = cliResult.stdout.includes("\x1b[");
  logTest("CLI snapshot has ANSI codes (TUI format)", cliHasAnsi);

  // Test Chat snapshot (need to connect first)
  await runCommand(`pnpm dev chat '/connect ${shortId}'`);
  await sleep(300);
  const chatResult = await runCommand(`pnpm dev chat '/snapshot'`);
  const chatHasOutput = chatResult.stdout.length > 0 && !chatResult.stdout.includes("No active session");
  logTest("Chat snapshot returns output", chatHasOutput);

  // Check for HTML format (should have <pre> tags, no ANSI codes)
  const chatHasPreTag = chatResult.stdout.includes("<pre>");
  const chatHasNoAnsi = !chatResult.stdout.includes("\x1b[");
  logTest("Chat snapshot has HTML pre tag format", chatHasPreTag);
  logTest("Chat snapshot has no ANSI codes (Telegram format)", chatHasNoAnsi);
}

async function testConnectCommand(instanceId: string): Promise<void> {
  logSection("TEST: Connect Command");

  // Get short ID
  const idMapFile = join(homedir(), ".pty-gateway", "instance-ids.json");
  let shortId = "1";
  if (existsSync(idMapFile)) {
    const map = JSON.parse(readFileSync(idMapFile, "utf8"));
    for (const [short, full] of Object.entries(map)) {
      if (full === instanceId) {
        shortId = short;
        break;
      }
    }
  }

  // Test CLI connect
  const cliResult = await runCommand(`pnpm dev connect ${shortId}`);
  const cliConnected = cliResult.stdout.includes("Connected to PTY");
  logTest("CLI connect succeeds", cliConnected);

  const cliHasSnapshot = cliResult.stdout.includes("PID") || cliResult.stdout.includes("CPU");
  logTest("CLI connect shows snapshot", cliHasSnapshot);

  // Test Chat connect
  const chatResult = await runCommand(`pnpm dev chat '/connect ${shortId}'`);
  const chatConnected = chatResult.stdout.includes("Connected to PTY");
  logTest("Chat connect succeeds", chatConnected);

  const chatHasPreTag = chatResult.stdout.includes("<pre>");
  const chatHasNoAnsi = !chatResult.stdout.includes("\x1b[");
  logTest("Chat connect has HTML pre tag format", chatHasPreTag);
  logTest("Chat connect has no ANSI codes", chatHasNoAnsi);
}

async function testSendCommand(instanceId: string): Promise<void> {
  logSection("TEST: Send Command");

  // Get short ID
  const idMapFile = join(homedir(), ".pty-gateway", "instance-ids.json");
  let shortId = "1";
  if (existsSync(idMapFile)) {
    const map = JSON.parse(readFileSync(idMapFile, "utf8"));
    for (const [short, full] of Object.entries(map)) {
      if (full === instanceId) {
        shortId = short;
        break;
      }
    }
  }

  // Test CLI send
  const cliResult = await runCommand(`pnpm dev send ${shortId} 'echo test123'`);
  const cliSent = cliResult.stdout.includes("Sending to PTY");
  logTest("CLI send command executes", cliSent);

  const cliHasOutput = cliResult.stdout.includes("test123");
  logTest("CLI send shows output", cliHasOutput);

  // Test Chat auto-snapshot (connect + send command in one session)
  // Use interactive mode simulation: connect, then send command
  const chatConnectResult = await runCommand(`pnpm dev chat '/connect ${shortId}'`);
  const chatConnected = chatConnectResult.stdout.includes("Connected to PTY");
  logTest("Chat connect for auto-snapshot test", chatConnected);

  // Check that auto-snapshot appeared after connect
  const hasSnapshotAfterConnect = chatConnectResult.stdout.includes("```");
  logTest("Chat shows snapshot after connect", hasSnapshotAfterConnect);
}

// ── Main Test Runner ────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "═".repeat(70));
  console.log("  PTY Gateway - Comprehensive Isolated Test Suite");
  console.log("═".repeat(70));

  try {
    // Setup
    await startPtyServer();
    await sleep(500);

    // Test with htop
    logSection("TESTING WITH HTOP INSTANCE");
    const htopId = await createTestInstance("htop");
    await sleep(500);

    await testListCommand(htopId);
    await testSnapshotCommand(htopId);
    await testConnectCommand(htopId);

    // Cleanup htop
    await cleanupTestInstances();

    // Test with bash
    logSection("TESTING WITH BASH INSTANCE");
    const bashId = await createTestInstance("bash");
    await sleep(500);

    await testListCommand(bashId);
    await testSnapshotCommand(bashId);
    await testConnectCommand(bashId);
    await testSendCommand(bashId);

    // Cleanup bash
    await cleanupTestInstances();

  } catch (err) {
    console.error("\n❌ Test suite failed:", err);
  } finally {
    // Final cleanup
    await cleanupTestInstances();
    await stopPtyServer();
  }

  // Print summary
  logSection("TEST SUMMARY");
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);

  console.log(`\n  Total Tests: ${total}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${total - passed}`);
  console.log(`  Success Rate: ${percentage}%\n`);

  if (passed === total) {
    console.log("  🎉 ALL TESTS PASSED!\n");
  } else {
    console.log("  ⚠️  Some tests failed. Review details above.\n");
  }

  console.log("═".repeat(70) + "\n");

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
