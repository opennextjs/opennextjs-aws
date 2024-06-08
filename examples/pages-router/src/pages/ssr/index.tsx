import { InferGetServerSidePropsType } from "next";

export async function getServerSideProps() {
  return {
    props: {
      time: new Date().toISOString(),
      envVar: process.env.SOME_PROD_VAR,
    },
  };
}

export default function Page({
  time,
  envVar,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <h1>SSR</h1>
      <div className="flex">Time: {time}</div>
      <div>Env: {envVar}</div>
    </>
  );
}
