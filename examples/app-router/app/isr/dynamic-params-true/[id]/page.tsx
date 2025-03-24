import { notFound } from "next/navigation";

// We'll prerender only the params from `generateStaticParams` at build time.
// If a request comes in for a path that hasn't been generated,
// Next.js will server-render the page on-demand.
// https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamicparams
export const dynamicParams = true; // or false, to 404 on unknown paths

const POSTS = Array.from({ length: 20 }, (_, i) => ({
  id: String(i + 1),
  title: `Post ${i + 1}`,
  content: `This is post ${i + 1}`,
}));

async function fakeGetPostsFetch() {
  return POSTS.slice(0, 10);
}

async function fakeGetPostFetch(id: string) {
  return POSTS.find((post) => post.id === id);
}

export async function generateStaticParams() {
  const fakePosts = await fakeGetPostsFetch();
  return fakePosts.map((post) => ({
    id: post.id,
  }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await fakeGetPostFetch(id);
  if (Number(id) === 1337) {
    throw new Error("This is an error!");
  }
  if (!post) {
    notFound();
  }
  return (
    <main>
      <h1 data-testid="title">{post.title}</h1>
      <p data-testid="content">{post.content}</p>
    </main>
  );
}
