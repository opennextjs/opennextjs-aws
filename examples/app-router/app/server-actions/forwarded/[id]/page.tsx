import Link from "next/link";

// This page does not bundle `saveDraft`, Next forwards the action posted to it to the edit page.
// For: serverActions.test.ts
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <h1>Item {id}</h1>
      <Link href={`/server-actions/forwarded/${id}/edit`}>Edit</Link>
    </div>
  );
}
