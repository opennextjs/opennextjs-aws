export function debug(...args: any[]) {
  if (process.env.OPEN_NEXT_DEBUG) {
    console.log(...args);
  }
}

export function error(...args: any[]) {
  console.error(...args);
}
