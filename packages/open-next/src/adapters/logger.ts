declare global {
  var openNextDebug: boolean;
}

export function debug(...args: any[]) {
  if (globalThis.openNextDebug) {
    console.log(...args);
  }
}

export function warn(...args: any[]) {
  console.warn(...args);
}

export function error(...args: any[]) {
  console.error(...args);
}

export const awsLogger = {
  trace: () => {},
  debug: () => {},
  info: debug,
  warn,
  error,
};
