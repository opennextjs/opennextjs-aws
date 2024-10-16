import logger from "../logger.js";

export function printHeader(header: string) {
  header = `OpenNext — ${header}`;
  logger.info(
    [
      "",
      "┌" + "─".repeat(header.length + 2) + "┐",
      `│ ${header} │`,
      "└" + "─".repeat(header.length + 2) + "┘",
      "",
    ].join("\n"),
  );
}
