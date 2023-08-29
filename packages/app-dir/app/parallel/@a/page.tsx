import Link from "next/link";

export default function A() {
  return (
    <div className="border p-4">
      <h1>Parallel Route A</h1>
      <Link href="/parallel/a-page">Go to a-page</Link>
    </div>
  );
}
