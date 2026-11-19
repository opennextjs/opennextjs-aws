/**
 * Excludes every parameter so routing must reach the outer catch-all.
 *
 * @return An empty set of generated paths with fallback disabled
 */
export function getStaticPaths() {
  return { paths: [], fallback: false };
}

/**
 * Supplies the static props required by this excluded-route fixture.
 *
 * @return Empty page props
 */
export function getStaticProps() {
  return { props: {} };
}

/**
 * Identifies an unexpected rendering of the excluded nested catch-all.
 *
 * @return A diagnostic heading
 */
export default function Page() {
  return <h1>Excluded nested catch-all route</h1>;
}
