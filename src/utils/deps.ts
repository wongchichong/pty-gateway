// Dynamic dependency loader with auto-install support
import { execSync } from "child_process";
import type { ChannelType, ChannelDependency, CHANNEL_DEPENDENCIES } from "../channels/types.js";

type ChannelDeps = typeof CHANNEL_DEPENDENCIES;

/**
 * Check if a package is installed
 */
export function isPackageInstalled(packageName: string): boolean {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Install a package using npm/pnpm
 */
export async function installPackage(packageName: string, version?: string): Promise<boolean> {
  const spec = version ? `${packageName}@${version}` : packageName;
  
  try {
    console.log(`Installing ${spec}...`);
    
    // Try pnpm first (faster), fall back to npm
    try {
      execSync(`pnpm add ${spec}`, { stdio: "inherit" });
    } catch {
      execSync(`npm install ${spec}`, { stdio: "inherit" });
    }
    
    console.log(`✓ Installed ${packageName}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to install ${packageName}:`, err);
    return false;
  }
}

/**
 * Dynamically import a package, with optional auto-install
 */
export async function loadPackage<T = unknown>(
  packageName: string,
  options?: {
    autoInstall?: boolean;
    version?: string;
    installPrompt?: boolean;
  }
): Promise<T | null> {
  const { autoInstall = false, version, installPrompt = true } = options || {};

  // Try to import
  try {
    const mod = await import(packageName);
    return mod as T;
  } catch (err) {
    // Not installed
    if (!autoInstall) {
      if (installPrompt) {
        console.error(`
Missing dependency: ${packageName}

Install with:
  npm install ${packageName}
  # or
  pnpm add ${packageName}

Then run: pty-gateway --register
`);
      }
      return null;
    }

    // Auto-install
    const installed = await installPackage(packageName, version);
    if (!installed) {
      return null;
    }

    // Try import again
    try {
      const mod = await import(packageName);
      return mod as T;
    } catch {
      return null;
    }
  }
}

/**
 * Load a channel's dependency
 */
export async function loadChannelDependency(
  channelType: ChannelType,
  deps: ChannelDeps
): Promise<unknown | null> {
  const dep = deps[channelType];
  
  if (!dep) {
    // No dependency needed (HTTP-only or built-in)
    return null;
  }

  return loadPackage(dep.packageName, {
    autoInstall: false,
    installPrompt: true,
  });
}

/**
 * Check all channel dependencies and report status
 */
export function checkDependencies(deps: ChannelDeps): Record<ChannelType, boolean> {
  const status: Record<string, boolean> = {};

  for (const [channel, dep] of Object.entries(deps) as [ChannelType, ChannelDependency | null][]) {
    if (!dep) {
      status[channel] = true; // No dep needed
    } else {
      status[channel] = isPackageInstalled(dep.packageName);
    }
  }

  return status as Record<ChannelType, boolean>;
}

/**
 * Print dependency status table
 */
export function printDependencyStatus(deps: ChannelDeps): void {
  console.log("\nChannel Dependencies Status:\n");
  console.log("Channel         | Package                  | Status  | Size");
  console.log("----------------|--------------------------|---------|------");

  for (const [channel, dep] of Object.entries(deps) as [ChannelType, ChannelDependency | null][]) {
    if (!dep) {
      console.log(`${channel.padEnd(15)} | (built-in/HTTP)          | ✓ Ready | -`);
    } else {
      const installed = isPackageInstalled(dep.packageName);
      const status = installed ? "✓ Installed" : "✗ Missing ";
      console.log(
        `${channel.padEnd(15)} | ${dep.packageName.padEnd(24)} | ${status} | ${dep.size}`
      );
    }
  }

  console.log("");
}
