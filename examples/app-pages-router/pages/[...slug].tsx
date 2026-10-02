import type {
  GetStaticPathsResult,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from "next";

/**
 * Leaves catch-all responses for blocking runtime generation.
 *
 * @returns An empty path list with blocking fallback enabled.
 */
export async function getStaticPaths(): Promise<GetStaticPathsResult> {
  return { paths: [], fallback: "blocking" };
}

/**
 * Generates the catch-all response used to test encoded ownership conflicts.
 *
 * @param context Static generation context containing catch-all segments.
 * @returns Catch-all props and an ISR cache lifetime.
 */
export async function getStaticProps(context: GetStaticPropsContext) {
  return {
    props: { slug: (context.params?.slug as string[]) ?? [] },
    revalidate: 60,
  };
}

/**
 * Renders a response owned by the root Pages Router catch-all.
 *
 * @param props Generated catch-all segments.
 * @returns Catch-all ownership marker and path.
 */
export default function CatchAllPage({
  slug,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <main>
      <p data-testid="cache-owner">mixed-root-catch-all</p>
      <p>{slug.join("/")}</p>
    </main>
  );
}
