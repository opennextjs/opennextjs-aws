import { InferGetStaticPropsType } from "next";
import Link from "next/link";

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
  return (
    <div>
      <div className="flex">Time: {time}</div>
      <Link href="/">Home</Link>
    </div>
  );
}
