import Editor from "./editor";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <h1>Edit item {id}</h1>
      <Editor id={id} />
    </div>
  );
}
