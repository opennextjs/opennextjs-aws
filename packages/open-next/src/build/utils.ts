import os from "node:os";

import logger from "../logger.js";

export function printHeader(header: string) {
  header = `OpenNext — ${header}`;
  logger.info(
    [
      "",
      `┌${"─".repeat(header.length + 2)}┐`,
      `│ ${header} │`,
      `└${"─".repeat(header.length + 2)}┘`,
      "",
    ].join("\n"),
  );
}

/**
 * Displays a warning on windows platform.
 */
export function showWarningOnWindows() {
  if (os.platform() !== "win32") return;

  logger.warn("OpenNext is not fully compatible with Windows.");
  logger.warn(
    "For optimal performance, it is recommended to use Windows Subsystem for Linux (WSL).",
  );
  logger.warn(
    "While OpenNext may function on Windows, it could encounter unpredictable failures during runtime.",
  );
}
