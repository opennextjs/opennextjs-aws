import { InferGetServerSidePropsType } from "next";

export async function getServerSideProps() {
  return {
    props: {
      time: new Date().toISOString(),
    },
  };
}

export default function Page({
  time,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <h1>SSR</h1>
      <div className="flex">Time: {time}</div>
    </>
  );
}
