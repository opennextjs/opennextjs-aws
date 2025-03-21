export const dynamicParams = false; // or false, to 404 on unknown paths

interface Post {
  id: string;
  title: string;
  content: string;
}

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
  const post = (await fakeGetPostFetch(id)) as Post;
  return (
    <main>
      <h1 data-testid="title">{post.title}</h1>
      <p data-testid="content">{post.content}</p>
    </main>
  );
}
