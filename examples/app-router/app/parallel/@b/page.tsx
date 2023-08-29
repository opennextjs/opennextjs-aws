import Link from "next/link";

export default function B() {
  return (
    <div className="border p-4">
      <h1>Parallel Route B</h1>

      <Link href="/parallel/b-page">Go to b-page</Link>
    </div>
  );
}
