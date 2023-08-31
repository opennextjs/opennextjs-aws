export function debug(...args: any[]) {
  if (process.env.OPEN_NEXT_DEBUG) {
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
