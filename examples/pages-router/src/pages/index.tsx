import Home from "@/components/home";

/**
 * Places the homepage in the shared SSG response cache without revalidation.
 *
 * @returns Empty static props for the prebuilt homepage.
 */
export function getStaticProps() {
  return { props: {} };
}

/**
 * Renders the prebuilt homepage used by the route-scoped cache regression.
 *
 * @returns The static Pages Router homepage.
 */
export default function IndexPage() {
  return (
    <>
      <p data-testid="cache-owner">prebuilt-homepage</p>
      <Home />
    </>
  );
}
