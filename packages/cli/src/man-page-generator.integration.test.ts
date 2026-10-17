import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { extractCommandInfo, generateManPage } from "./man-page-generator.js";
import { makeSearchCommand } from "./commands/search.js";
import { makeQuoteCommand } from "./commands/quote.js";
import { makePayCommand } from "./commands/pay.js";
import { makeInspectCommand } from "./commands/inspect.js";

describe("man page generation integration", () => {
  it("generates man page containing all registered vellar subcommands", () => {
    // Build the actual vellar program with all subcommands
    const program = new Command();
    program
      .name("vellar")
      .description("CLI for discovering, quoting, paying for, and inspecting x402 resources on Stellar")
      .version("0.1.0");

    program.addCommand(makeSearchCommand());
    program.addCommand(makeQuoteCommand());
    program.addCommand(makePayCommand());
    program.addCommand(makeInspectCommand());

    // Extract command metadata
    const commands = program
      .commands
      .map((cmd) => extractCommandInfo(cmd))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Verify all expected commands are present
    const commandNames = commands.map((c) => c.name);
    expect(commandNames).toContain("search");
    expect(commandNames).toContain("quote");
    expect(commandNames).toContain("pay");
    expect(commandNames).toContain("inspect");
    expect(commandNames).toHaveLength(4);

    // Generate man page
    const manPage = generateManPage(
      program.name(),
      program.description() || "",
      program.version() || "0.1.0",
      commands,
    );

    // Verify man page contains all subcommand names
    expect(manPage).toContain("search");
    expect(manPage).toContain("quote");
    expect(manPage).toContain("pay");
    expect(manPage).toContain("inspect");

    // Verify man page has proper structure
    expect(manPage).toContain(".TH VELLAR 1");
    expect(manPage).toContain(".SH NAME");
    expect(manPage).toContain(".SH SYNOPSIS");
    expect(manPage).toContain(".SH DESCRIPTION");
    expect(manPage).toContain(".SH COMMANDS");
    expect(manPage).toContain(".SH ENVIRONMENT");
    expect(manPage).toContain(".SH VERSION");
  });

  it("includes search command with its arguments and options", () => {
    const commands = [extractCommandInfo(makeSearchCommand())];
    const manPage = generateManPage("vellar", "CLI tool", "0.1.0", commands);

    expect(manPage).toContain("search");
    expect(manPage).toContain("query");
    expect(manPage).toContain("--facilitator");
    expect(manPage).toContain("--limit");
    expect(manPage).toContain("--json");
  });

  it("includes quote command with its arguments and options", () => {
    const commands = [extractCommandInfo(makeQuoteCommand())];
    const manPage = generateManPage("vellar", "CLI tool", "0.1.0", commands);

    expect(manPage).toContain("quote");
    expect(manPage).toContain("--json");
  });

  it("includes pay command with its arguments and options", () => {
    const commands = [extractCommandInfo(makePayCommand())];
    const manPage = generateManPage("vellar", "CLI tool", "0.1.0", commands);

    expect(manPage).toContain("pay");
    expect(manPage).toContain("--secret");
    expect(manPage).toContain("--max");
    expect(manPage).toContain("--network");
  });

  it("includes inspect command with its arguments and options", () => {
    const commands = [extractCommandInfo(makeInspectCommand())];
    const manPage = generateManPage("vellar", "CLI tool", "0.1.0", commands);

    expect(manPage).toContain("inspect");
    expect(manPage).toContain("--network");
    expect(manPage).toContain("--json");
  });

  it("generates valid troff markup throughout the man page", () => {
    const program = new Command();
    program
      .name("vellar")
      .description("CLI for discovering, quoting, paying for, and inspecting x402 resources on Stellar")
      .version("0.1.0");

    program.addCommand(makeSearchCommand());
    program.addCommand(makeQuoteCommand());
    program.addCommand(makePayCommand());
    program.addCommand(makeInspectCommand());

    const commands = program.commands.map((cmd) => extractCommandInfo(cmd));
    const manPage = generateManPage(
      program.name(),
      program.description() || "",
      program.version() || "0.1.0",
      commands,
    );

    // Check for proper troff directives
    expect(manPage).toMatch(/^\.TH/m); // Man page header
    expect(manPage).toMatch(/\.SH NAME/);
    expect(manPage).toMatch(/\.SH SYNOPSIS/);
    expect(manPage).toMatch(/\.BI/m); // Bold italic for command names
    expect(manPage).toMatch(/\.RS/m); // Start of indented block
    expect(manPage).toMatch(/\.RE/m); // End of indented block
    expect(manPage).toMatch(/\.IP/m); // Indented paragraph for options

    // Check that we don't have unescaped problematic characters in key places
    const nameSection = manPage.split(".SH NAME")[1].split(".SH")[0];
    expect(nameSection).not.toMatch(/[^\\]-(?=\s)/); // Single unescaped dash before space
  });
});
