import type { InferGetStaticPropsType } from "next";

export function getStaticProps() {
  return {
    props: {
      message: "This is a static ssg page.",
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
