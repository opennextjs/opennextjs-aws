/**
 * A `notFound` result is not rendered by the route module itself, it is delegated to
 * `routerServerContext.render404`. When that context is missing the route module falls back to a
 * bare `This page could not be found` body instead of the app's 404 page.
 *
 * See tests-e2e/tests/pagesRouter/ssr-not-found.test.ts.
 */
export async function getServerSideProps() {
  return { notFound: true };
}

export default function Page() {
  return null;
}
