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
  return <div className="flex">SSR: {time}</div>;
}
