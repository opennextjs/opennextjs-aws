/**
 * Flags that do not take a value. They are `true` when present and never consume the next argument.
 */
const BOOLEAN_FLAGS = new Set([
  "--help",
  "--dangerously-use-unsupported-next-version",
]);

export interface CliArgs {
  /** Value of `--config-path` */
  configPath?: string;
  /** Value of `--node-externals` */
  nodeExternals?: string;
  /** Whether `--help` is present */
  help: boolean;
  /** Whether `--dangerously-use-unsupported-next-version` is present */
  dangerouslyUseUnsupportedNextVersion: boolean;
}

/**
 * Parses the command line arguments of the `open-next` CLI.
 *
 * Boolean flags (i.e. `--help`) are `true` when present and never consume the following argument.
 * Other flags take the following argument as their value unless it starts with `-`.
 *
 * @param argv - The CLI arguments, without the node executable and script path (i.e. `process.argv.slice(2)`)
 * @returns The parsed arguments
 */
export function parseArgs(argv: string[]): CliArgs {
  const flags = new Set<string>();
  const values: Record<string, string | undefined> = {};

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) {
      continue;
    }
    if (BOOLEAN_FLAGS.has(key)) {
      flags.add(key);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("-")) {
      values[key] = next;
      i++;
    } else {
      values[key] = undefined;
    }
  }

  return {
    configPath: values["--config-path"],
    nodeExternals: values["--node-externals"],
    help: flags.has("--help"),
    dangerouslyUseUnsupportedNextVersion: flags.has(
      "--dangerously-use-unsupported-next-version",
    ),
  };
}
