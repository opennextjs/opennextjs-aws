import chalk from "chalk";

type LEVEL = "info" | "debug";

let logLevel: LEVEL = "info";

export default {
  setLevel: (level: LEVEL) => (logLevel = level),
  debug: (...args: any[]) => {
    if (logLevel !== "debug") return;
    console.log(chalk.magenta("DEBUG"), ...args);
  },
  info: console.log,
  warn: (...args: any[]) => console.warn(chalk.yellow("WARN"), ...args),
  error: (...args: any[]) => console.error(chalk.red("ERROR"), ...args),
};
