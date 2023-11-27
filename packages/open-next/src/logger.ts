type LEVEL = "info" | "debug";

let logLevel: LEVEL = "info";

export default {
  setLevel: (level: LEVEL) => (logLevel = level),
  debug: (...args: any[]) => {
    if (logLevel !== "debug") return;
    console.log("DEBUG", ...args);
  },
  info: console.log,
  warn: console.warn,
  error: console.error,
};
