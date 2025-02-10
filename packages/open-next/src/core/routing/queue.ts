// Since we're using a FIFO queue, every messageGroupId is treated sequentially
// This could cause a backlog of messages in the queue if there is too much page to
// revalidate at once. To avoid this, we generate a random messageGroupId for each
// revalidation request.
// We can't just use a random string because we need to ensure that the same rawPath
// will always have the same messageGroupId.
// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript#answer-47593316
export function generateMessageGroupId(rawPath: string) {
  let a = cyrb128(rawPath);
  // We use mulberry32 to generate a random int between 0 and MAX_REVALIDATE_CONCURRENCY
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const randomFloat = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  // This will generate a random int between 0 and MAX_REVALIDATE_CONCURRENCY
  // This means that we could have 1000 revalidate request at the same time
  const maxConcurrency = Number.parseInt(
    process.env.MAX_REVALIDATE_CONCURRENCY ?? "10",
  );
  const randomInt = Math.floor(randomFloat * maxConcurrency);
  return `revalidate-${randomInt}`;
}

// Used to generate a hash int from a string
function cyrb128(str: string) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0, k: number; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  // biome-ignore lint/style/noCommaOperator:
  (h1 ^= h2 ^ h3 ^ h4), (h2 ^= h1), (h3 ^= h1), (h4 ^= h1);
  return h1 >>> 0;
}
