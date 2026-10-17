import { Command } from "commander";

export interface CommandInfo {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  options: Array<{
    name: string;
    description: string;
    defaultValue?: string;
  }>;
}

/**
 * Extract command metadata from a commander Command instance.
 * Walks through registered arguments and options to build a structured representation.
 */
export function extractCommandInfo(command: Command): CommandInfo {
  const info: CommandInfo = {
    name: command.name(),
    description: command.description() || "",
    arguments: [],
    options: [],
  };

  // Extract arguments
  if (command.registeredArguments && command.registeredArguments.length > 0) {
    for (const arg of command.registeredArguments) {
      info.arguments.push({
        name: arg.name() || "argument",
        description: arg.description || "",
        required: arg.required !== false,
      });
    }
  }

  // Extract options (skip help option as it's standard)
  if (command.options && command.options.length > 0) {
    for (const opt of command.options) {
      if (opt.long === "--help" || opt.short === "-h") {
        continue; // Skip help, it's implicit
      }
      info.options.push({
        name: opt.long || opt.short || "",
        description: opt.description || "",
        defaultValue: opt.defaultValue,
      });
    }
  }

  return info;
}

/**
 * Format a date string in the format expected by man pages (YYYY-MM-DD or "1 January 2000").
 * Returns the current date if not provided.
 */
function formatManDate(date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Escape special characters in troff format to prevent interpretation.
 * In troff, backslashes and certain characters have special meaning.
 */
function escapeTraffText(text: string): string {
  // Escape backslashes first, then other special chars
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\-/g, "\\-")
    .replace(/'/g, "\\'");
}

/**
 * Generate a troff-formatted man page from a list of commands.
 * Produces output compatible with the man command and groff/nroff.
 *
 * @param programName Name of the program (e.g., "vellar")
 * @param programDescription Description of the program
 * @param version Version string
 * @param commands List of extracted command info objects
 * @param date Optional date for the man page (defaults to today)
 * @returns Troff-formatted man page content as a string
 */
export function generateManPage(
  programName: string,
  programDescription: string,
  version: string,
  commands: CommandInfo[],
  date?: Date,
): string {
  const lines: string[] = [];

  // Man page header: .TH name section date source manual
  // Section 1 = user commands
  lines.push(`.TH ${programName.toUpperCase()} 1 "${formatManDate(date)}" "${programName} ${version}" "User Commands"`);
  lines.push("");

  // NAME section: brief description
  lines.push(".SH NAME");
  lines.push(`${escapeTraffText(programName)} \\- ${escapeTraffText(programDescription)}`);
  lines.push("");

  // SYNOPSIS section
  lines.push(".SH SYNOPSIS");
  lines.push(`.B ${programName}`);
  lines.push(".RI [ COMMAND ] [ OPTIONS ]");
  lines.push("");

  // DESCRIPTION section
  lines.push(".SH DESCRIPTION");
  lines.push(
    escapeTraffText(
      `${programName} is a command-line tool with multiple subcommands for managing x402 resources on Stellar.`,
    ),
  );
  lines.push("");

  // COMMANDS section (if there are any commands)
  if (commands.length > 0) {
    lines.push(".SH COMMANDS");
    lines.push("");

    for (const cmd of commands) {
      // Command name and description
      lines.push(`.BI ${cmd.name}`);
      lines.push(`.RS`);
      lines.push(escapeTraffText(cmd.description));
      lines.push("");

      // Arguments for this command
      if (cmd.arguments.length > 0) {
        lines.push(".B Arguments:");
        lines.push(".RS");
        for (const arg of cmd.arguments) {
          const req = arg.required ? "(required)" : "(optional)";
          lines.push(`.IP "\\fB${escapeTraffText(arg.name)}\\fR ${req}"`);
          lines.push(escapeTraffText(arg.description));
        }
        lines.push(".RE");
        lines.push("");
      }

      // Options for this command
      if (cmd.options.length > 0) {
        lines.push(".B Options:");
        lines.push(".RS");
        for (const opt of cmd.options) {
          let optLine = `.IP "\\fB${escapeTraffText(opt.name)}\\fR"`;
          if (opt.defaultValue) {
            optLine += ` (default: ${escapeTraffText(String(opt.defaultValue))})`;
          }
          lines.push(optLine);
          lines.push(escapeTraffText(opt.description));
        }
        lines.push(".RE");
        lines.push("");
      }

      lines.push(".RE");
      lines.push("");
    }
  }

  // ENVIRONMENT section: document relevant environment variables
  lines.push(".SH ENVIRONMENT");
  lines.push(".TP");
  lines.push(".B VELLAR_FACILITATOR_URL");
  lines.push(escapeTraffText("Default facilitator URL for search command"));
  lines.push(".TP");
  lines.push(".B VELLAR_SECRET");
  lines.push(escapeTraffText("Secret key for pay command"));
  lines.push(".TP");
  lines.push(".B VELLAR_NETWORK");
  lines.push(escapeTraffText("Network (testnet or mainnet) for pay and inspect commands"));
  lines.push("");

  // VERSION section
  lines.push(".SH VERSION");
  lines.push(escapeTraffText(`${programName} version ${version}`));
  lines.push("");

  // AUTHORS section
  lines.push(".SH AUTHORS");
  lines.push("Vellar Wallet Team");
  lines.push("");

  // BUGS section
  lines.push(".SH BUGS");
  lines.push(
    escapeTraffText(
      "Report bugs at https://github.com/Vellar-Wallet/vellar-sdk/issues",
    ),
  );
  lines.push("");

  return lines.join("\n");
}
