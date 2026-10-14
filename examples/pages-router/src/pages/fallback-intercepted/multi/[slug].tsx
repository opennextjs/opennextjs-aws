/**
 * Excludes every parameter so routing must try the next matching route.
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
 * Identifies an unexpected rendering of the first excluded candidate.
 *
 * @return A diagnostic heading
 */
export default function Page() {
  return <h1>Excluded single-segment route</h1>;
}
