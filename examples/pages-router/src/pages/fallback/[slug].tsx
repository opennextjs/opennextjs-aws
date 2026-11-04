import type { GetStaticPropsContext, InferGetStaticPropsType } from "next";

export function getStaticPaths() {
  return {
    paths: ["fallback", "with space", "Présentation", "a/b"].map((slug) => ({
      params: { slug },
    })),
    fallback: false,
  };
}

export function getStaticProps({ params }: GetStaticPropsContext) {
  return {
    props: {
      message: "This is a static fallback page.",
      slug: params?.slug as string,
    },
  };
}

export default function Page({
  message,
  slug,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <div>
      <h1>Static Fallback Page</h1>
      <p data-testid="message">{message}</p>
      <p data-testid="slug">{slug}</p>
    </div>
  );
}
