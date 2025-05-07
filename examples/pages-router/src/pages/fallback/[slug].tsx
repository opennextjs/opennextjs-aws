import type { InferGetStaticPropsType } from "next";

export function getStaticPaths() {
  return {
    paths: [
      {
        params: {
          slug: "fallback",
        },
      },
    ],
    fallback: false,
  };
}

export function getStaticProps() {
  return {
    props: {
      message: "This is a static fallback page.",
    },
  };
}

export default function Page({
  message,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <div>
      <h1>Static Fallback Page</h1>
      <p data-testid="message">{message}</p>
    </div>
  );
}
