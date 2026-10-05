/**
 * Generate a Pages Router ISR entry.
 *
 * @returns The generation timestamp and revalidation interval.
 */
export function getStaticProps() {
  return { props: { timestamp: Date.now() }, revalidate: 5 };
}

/**
 * Render the Pages Router fixture.
 *
 * @param props The generated page props.
 * @returns The generation timestamp.
 */
export default function Page({ timestamp }) {
  return <p>{timestamp}</p>;
}
