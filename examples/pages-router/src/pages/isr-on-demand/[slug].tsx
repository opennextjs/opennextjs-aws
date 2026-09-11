import type {
  GetStaticPathsResult,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from "next";

// No path is enumerated at build time, so every path is rendered on demand on first request.
// The prerender manifest therefore holds no cache control for any concrete path, only for the
// `/isr-on-demand/[slug]` pattern - which is what makes Next.js unable to resolve the revalidate
// of these pages from the manifest alone.
export function getStaticPaths(): GetStaticPathsResult {
  return {
    paths: [],
    fallback: "blocking",
  };
}

export function getStaticProps(context: GetStaticPropsContext) {
  return {
    props: {
      slug: String(context.params?.slug ?? ""),
      time: new Date().toISOString(),
    },
    revalidate: 60,
  };
}

export default function Page({
  slug,
  time,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <div>
      <h1>On demand ISR page</h1>
      <p data-testid="slug">{slug}</p>
      <p data-testid="time">{time}</p>
    </div>
  );
}
