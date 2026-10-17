#!/usr/bin/env node

/**
 * Generate man page from the CLI command definitions.
 * This script walks the registered commands in packages/cli/src/bin.ts,
 * extracts their metadata, and generates a troff-formatted man page.
 * 
 * Usage: node dist/scripts/generate-man-page.js [--output <path>]
 * 
 * Output defaults to ./dist/vellar.1 if not specified.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { extractCommandInfo, generateManPage } from "../dist/man-page-generator.js";
import { makeSearchCommand } from "../dist/commands/search.js";
import { makeQuoteCommand } from "../dist/commands/quote.js";
import { makePayCommand } from "../dist/commands/pay.js";
import { makeInspectCommand } from "../dist/commands/inspect.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");

function getVersion(): string {
  try {
    const packageJsonPath = join(packageRoot, "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
    return packageJson.version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function main() {
  try {
    // Parse command-line arguments
    let outputPath = join(packageRoot, "dist", "vellar.1");
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--output" && args[i + 1]) {
        outputPath = resolve(args[i + 1]);
        i++; // Skip the next arg as we've consumed it
      }
    }

    // Get the version from package.json
    const version = getVersion();

    // Build the command program with all subcommands
    const program = new Command();
    program
      .name("vellar")
      .description("CLI for discovering, quoting, paying for, and inspecting x402 resources on Stellar")
      .version(version);

    program.addCommand(makeSearchCommand());
    program.addCommand(makeQuoteCommand());
    program.addCommand(makePayCommand());
    program.addCommand(makeInspectCommand());

    // Extract command metadata
    const commands = program
      .commands
      .map((cmd) => extractCommandInfo(cmd))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Generate man page
    const manPageContent = generateManPage(
      program.name(),
      program.description() || "",
      version,
      commands,
    );

    // Ensure output directory exists
    const outputDir = dirname(outputPath);
    mkdirSync(outputDir, { recursive: true });

    // Write man page to file
    writeFileSync(outputPath, manPageContent, "utf8");

    console.log(`✓ Man page generated successfully: ${outputPath}`);
    console.log(`  Commands: ${commands.map((c) => c.name).join(", ")}`);
  } catch (err) {
    console.error(
      "✗ Failed to generate man page:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

main();
