import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { Suspense } from "react";

type PageProps = { params: Promise<{ slug: string }> };

async function Shell({ depth, slug }: { depth: number; slug: string }) {
  if (depth > 0) {
    await Promise.resolve();
    return (
      <div>
        <Shell depth={depth - 1} slug={slug} />
      </div>
    );
  }

  // A fixed microtask budget can end the stage before this leaf settles.
  for (let i = 0; i < 5_000; i++) await Promise.resolve();
  return <p>{`Deep shell complete: ${slug}`}</p>;
}

async function RuntimeShell({ params }: PageProps) {
  const { slug } = await params;
  return <Shell depth={8} slug={slug} />;
}

const readRandomBytes = promisify(randomBytes);

async function UncachedContent() {
  // The callback form uses the Node.js thread pool without Next.js cache tracking.
  const bytes = await readRandomBytes(16);
  return <p>{`Uncached I/O: ${bytes.toString("hex")}`}</p>;
}

export default function Page({ params }: PageProps) {
  return (
    <main>
      <h1>Staged render</h1>
      <Suspense fallback={<p>Loading shell...</p>}>
        <RuntimeShell params={params} />
      </Suspense>
      <Suspense fallback={<p>Loading uncached data...</p>}>
        <UncachedContent />
      </Suspense>
    </main>
  );
}
