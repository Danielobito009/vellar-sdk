import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { extractCommandInfo, generateManPage } from "./man-page-generator.js";

describe("extractCommandInfo", () => {
  it("extracts basic command metadata", () => {
    const cmd = new Command("test").description("Test command");
    const info = extractCommandInfo(cmd);

    expect(info.name).toBe("test");
    expect(info.description).toBe("Test command");
    expect(info.arguments).toEqual([]);
    expect(info.options).toEqual([]);
  });

  it("extracts required arguments", () => {
    const cmd = new Command("search").argument("<query>", "Search query").description("Search");
    const info = extractCommandInfo(cmd);

    expect(info.arguments).toHaveLength(1);
    expect(info.arguments[0]?.name).toBe("query");
    expect(info.arguments[0]?.description).toBe("Search query");
    expect(info.arguments[0]?.required).toBe(true);
  });

  it("extracts multiple arguments", () => {
    const cmd = new Command("test")
      .argument("<first>", "First arg")
      .argument("[second]", "Second arg")
      .description("Test");
    const info = extractCommandInfo(cmd);

    expect(info.arguments).toHaveLength(2);
    expect(info.arguments[0]?.required).toBe(true);
    expect(info.arguments[1]?.required).toBe(false);
  });

  it("extracts options with descriptions", () => {
    const cmd = new Command("test")
      .option("--json", "Output JSON")
      .option("-v, --verbose", "Verbose output")
      .description("Test");
    const info = extractCommandInfo(cmd);

    expect(info.options).toHaveLength(2);
    expect(info.options[0]?.name).toContain("--json");
    expect(info.options[0]?.description).toBe("Output JSON");
  });

  it("extracts option default values", () => {
    const cmd = new Command("test")
      .option("--limit <n>", "Result limit", "10")
      .description("Test");
    const info = extractCommandInfo(cmd);

    expect(info.options).toHaveLength(1);
    expect(info.options[0]?.defaultValue).toBe("10");
  });

  it("skips the help option", () => {
    const cmd = new Command("test")
      .option("--json", "Output JSON")
      .description("Test");
    const info = extractCommandInfo(cmd);

    // Help option should not be included
    const hasHelp = info.options.some((opt) => opt.name === "--help" || opt.name === "-h");
    expect(hasHelp).toBe(false);
  });

  it("handles commands with no arguments or options", () => {
    const cmd = new Command("simple").description("Simple command");
    const info = extractCommandInfo(cmd);

    expect(info.name).toBe("simple");
    expect(info.description).toBe("Simple command");
    expect(info.arguments).toHaveLength(0);
    expect(info.options).toHaveLength(0);
  });

  it("handles commands with empty descriptions", () => {
    const cmd = new Command("test");
    const info = extractCommandInfo(cmd);

    expect(info.description).toBe("");
  });
});

describe("generateManPage", () => {
  it("generates valid troff man page header", () => {
    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", []);

    expect(manPage).toContain(".TH VELLAR 1");
    expect(manPage).toContain('"1.0.0"');
    expect(manPage).toContain("User Commands");
  });

  it("includes program name and description in NAME section", () => {
    const manPage = generateManPage("vellar", "CLI tool for Stellar", "1.0.0", []);

    expect(manPage).toContain(".SH NAME");
    expect(manPage).toContain("vellar");
    expect(manPage).toContain("CLI tool for Stellar");
  });

  it("includes SYNOPSIS section", () => {
    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", []);

    expect(manPage).toContain(".SH SYNOPSIS");
    expect(manPage).toContain(".B vellar");
  });

  it("includes DESCRIPTION section", () => {
    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", []);

    expect(manPage).toContain(".SH DESCRIPTION");
  });

  it("includes all standard sections", () => {
    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", []);

    expect(manPage).toContain(".SH ENVIRONMENT");
    expect(manPage).toContain(".SH VERSION");
    expect(manPage).toContain(".SH AUTHORS");
    expect(manPage).toContain(".SH BUGS");
  });

  it("includes environment variables documentation", () => {
    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", []);

    expect(manPage).toContain("VELLAR_FACILITATOR_URL");
    expect(manPage).toContain("VELLAR_SECRET");
    expect(manPage).toContain("VELLAR_NETWORK");
  });

  it("generates COMMANDS section from provided commands", () => {
    const commands = [
      {
        name: "search",
        description: "Search for resources",
        arguments: [],
        options: [],
      },
      {
        name: "quote",
        description: "Quote a resource",
        arguments: [],
        options: [],
      },
    ];

    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", commands);

    expect(manPage).toContain(".SH COMMANDS");
    expect(manPage).toContain("search");
    expect(manPage).toContain("Search for resources");
    expect(manPage).toContain("quote");
    expect(manPage).toContain("Quote a resource");
  });

  it("includes command arguments in COMMANDS section", () => {
    const commands = [
      {
        name: "search",
        description: "Search",
        arguments: [
          {
            name: "query",
            description: "Search query",
            required: true,
          },
        ],
        options: [],
      },
    ];

    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", commands);

    expect(manPage).toContain("query");
    expect(manPage).toContain("Search query");
    expect(manPage).toContain("(required)");
  });

  it("distinguishes between required and optional arguments", () => {
    const commands = [
      {
        name: "test",
        description: "Test",
        arguments: [
          {
            name: "required-arg",
            description: "Required",
            required: true,
          },
          {
            name: "optional-arg",
            description: "Optional",
            required: false,
          },
        ],
        options: [],
      },
    ];

    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", commands);

    expect(manPage).toContain("(required)");
    expect(manPage).toContain("(optional)");
  });

  it("includes command options in COMMANDS section", () => {
    const commands = [
      {
        name: "search",
        description: "Search",
        arguments: [],
        options: [
          {
            name: "--json",
            description: "Output as JSON",
          },
          {
            name: "--limit",
            description: "Result limit",
            defaultValue: "10",
          },
        ],
      },
    ];

    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", commands);

    expect(manPage).toContain("--json");
    expect(manPage).toContain("Output as JSON");
    expect(manPage).toContain("--limit");
    expect(manPage).toContain("(default: 10)");
  });

  it("includes all registered subcommand names in man page", () => {
    const commands = [
      {
        name: "search",
        description: "Search",
        arguments: [],
        options: [],
      },
      {
        name: "quote",
        description: "Quote",
        arguments: [],
        options: [],
      },
      {
        name: "pay",
        description: "Pay",
        arguments: [],
        options: [],
      },
      {
        name: "inspect",
        description: "Inspect",
        arguments: [],
        options: [],
      },
    ];

    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", commands);

    expect(manPage).toContain("search");
    expect(manPage).toContain("quote");
    expect(manPage).toContain("pay");
    expect(manPage).toContain("inspect");
  });

  it("uses provided date in man page header", () => {
    const testDate = new Date(2024, 0, 15); // January 15, 2024
    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", [], testDate);

    expect(manPage).toContain("2024-01-15");
  });

  it("uses current date if none provided", () => {
    const before = new Date();
    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", []);
    const after = new Date();

    // Extract the date from the man page header
    const dateMatch = manPage.match(/\.TH.*?"(\d{4}-\d{2}-\d{2})"/);
    expect(dateMatch).toBeTruthy();

    if (dateMatch) {
      const [, manDate] = dateMatch;
      const [year, month, day] = manDate.split("-").map(Number);
      const pageDate = new Date(year, month - 1, day);

      // Should be within the range of before/after (same day)
      expect(pageDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(pageDate.getTime()).toBeLessThanOrEqual(after.getTime() + 86400000); // +1 day for edge cases
    }
  });

  it("escapes special characters in descriptions", () => {
    const commands = [
      {
        name: "test",
        description: "Test with backslash \\ and dashes -",
        arguments: [],
        options: [],
      },
    ];

    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", commands);

    // Should escape special characters for troff
    expect(manPage).toContain("\\\\");
    expect(manPage).toContain("\\-");
  });

  it("handles empty command list", () => {
    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", []);

    expect(manPage).toContain(".SH COMMANDS");
    // Should still have valid structure even with no commands
    expect(manPage).toContain(".SH ENVIRONMENT");
  });

  it("generates valid troff with multiple sections in order", () => {
    const manPage = generateManPage("vellar", "CLI tool", "1.0.0", []);

    const nameIdx = manPage.indexOf(".SH NAME");
    const synopsisIdx = manPage.indexOf(".SH SYNOPSIS");
    const descriptionIdx = manPage.indexOf(".SH DESCRIPTION");
    const commandsIdx = manPage.indexOf(".SH COMMANDS");
    const environmentIdx = manPage.indexOf(".SH ENVIRONMENT");

    expect(nameIdx).toBeLessThan(synopsisIdx);
    expect(synopsisIdx).toBeLessThan(descriptionIdx);
    expect(descriptionIdx).toBeLessThan(commandsIdx);
    expect(commandsIdx).toBeLessThan(environmentIdx);
  });

  it("includes version in VERSION section", () => {
    const manPage = generateManPage("vellar", "CLI tool", "2.5.1", []);

    expect(manPage).toContain(".SH VERSION");
    expect(manPage).toContain("vellar version 2.5.1");
  });
});
