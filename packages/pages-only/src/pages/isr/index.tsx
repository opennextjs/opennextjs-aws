import { InferGetStaticPropsType } from "next";

export async function getStaticProps() {
  return {
    props: {
      time: new Date().toISOString(),
    },
    revalidate: 10,
  };
}

export default function Page({
  time,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return <div className="flex">ISR: {time}</div>;
}
