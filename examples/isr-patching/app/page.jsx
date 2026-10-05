export const revalidate = 5;

/**
 * Render an App Router ISR entry.
 *
 * @returns A generation timestamp.
 */
export default function Page() {
  // This resembles the upstream properties but is not ResponseCache. It must
  // remain untouched when bundled into a generated server chunk.
  const entry = JSON.parse(process.env.LOOKALIKE_ENTRY ?? "{}");
  const request = JSON.parse(process.env.LOOKALIKE_REQUEST ?? "{}");
  const unrelated = JSON.parse(process.env.LOOKALIKE_CONTEXT ?? "{}");
  const untouched =
    !unrelated.isOnDemandRevalidate && (!entry.isStale || request.isPrefetch);
  return <p data-untouched={untouched}>{Date.now()}</p>;
}
