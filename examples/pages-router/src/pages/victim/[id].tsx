import type {
  GetStaticPathsResult,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from "next";

/**
 * Leaves every victim response for blocking runtime generation.
 *
 * @returns An empty path list with blocking fallback enabled.
 */
export async function getStaticPaths(): Promise<GetStaticPathsResult> {
  return { paths: [], fallback: "blocking" };
}

/**
 * Creates an ISR response owned by the specific victim route.
 *
 * @param context Static generation context containing the victim identifier.
 * @returns Props and cache lifetime for the generated response.
 */
export async function getStaticProps(context: GetStaticPropsContext) {
  return {
    props: {
      id: String(context.params?.id),
    },
    revalidate: 60,
  };
}

/**
 * Renders the canonical route whose decoded pathname can collide with the catch-all.
 *
 * @param props Generated victim identifier.
 * @returns The canonical victim response.
 */
export default function VictimPage({
  id,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <main>
      <p data-testid="cache-owner">specific-victim</p>
      <p data-testid="victim-id">{id}</p>
    </main>
  );
}
