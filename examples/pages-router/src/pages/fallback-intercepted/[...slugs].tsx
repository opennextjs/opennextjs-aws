import type { InferGetServerSidePropsType } from "next";

export function getServerSideProps() {
  return {
    props: {
      message: "This is a dynamic fallback page.",
    },
  };
}

export default function Page({
  message,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div>
      <h1>Dynamic Fallback Page</h1>
      <p data-testid="message">{message}</p>
    </div>
  );
}
