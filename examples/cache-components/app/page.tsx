import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Cache Components</h1>
      <Link href="/staged-render/linked" prefetch>
        Staged render
      </Link>
    </main>
  );
}
