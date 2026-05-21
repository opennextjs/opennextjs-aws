import type {
  GetStaticPaths,
  GetStaticProps,
  InferGetStaticPropsType,
} from "next";

export const getStaticPaths: GetStaticPaths = () => {
  return {
    paths: [],
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps = async (context) => {
  const slug = (context.params?.slug as string[] | undefined) ?? [];
  return {
    props: {
      slug,
      renderedAt: new Date().toISOString(),
    },
  };
};

export default function RewriteCodePath({
  slug,
  renderedAt,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      <h1>Rewrite Code Path</h1>
      <div>Slug: {slug.join("/") || "(empty)"}</div>
      <div>Rendered at: {renderedAt}</div>
    </>
  );
}
