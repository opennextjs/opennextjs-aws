export const revalidate = 5;

/**
 * Render an App Router ISR entry.
 *
 * @returns A generation timestamp.
 */
export default function Page() {
  return <p>{Date.now()}</p>;
}
