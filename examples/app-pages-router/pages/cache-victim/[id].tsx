import type {
  GetStaticPathsResult,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from "next";

/**
 * Leaves victim responses for blocking runtime generation.
 *
 * @returns An empty path list with blocking fallback enabled.
 */
export async function getStaticPaths(): Promise<GetStaticPathsResult> {
  return { paths: [], fallback: "blocking" };
}

/**
 * Generates an ISR response owned by the specific victim route.
 *
 * @param context Static generation context containing the victim identifier.
 * @returns Victim props and an ISR cache lifetime.
 */
export async function getStaticProps(context: GetStaticPropsContext) {
  return {
    props: { id: String(context.params?.id) },
    revalidate: 60,
  };
}

/**
 * Renders the specific route used to verify cache-interceptor fallthrough.
 *
 * @param props Generated victim identifier.
 * @returns Specific route ownership marker and identifier.
 */
export default function CacheVictimPage({
  id,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <main>
      <p data-testid="cache-owner">mixed-specific-victim</p>
      <p>{id}</p>
    </main>
  );
}
