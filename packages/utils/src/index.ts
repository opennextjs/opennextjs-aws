export * from "./binary";

// TODO: move util functions from open-next here (if/where it makes sense)
export function add(a: number, b: number) {
  return a + b;
}

export function generateUniqueId() {
  return Math.random().toString(36).slice(2, 8);
}

export async function wait(n: number = 1000) {
  return new Promise((res) => {
    setTimeout(res, n);
  });
}
