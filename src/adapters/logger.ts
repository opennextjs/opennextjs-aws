export function debug(...args: any[]) {
  if (process.env.OPEN_NEXT_DEBUG) {
    console.log(...args);
  }
}
