import { Suspense } from "react";

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
    </div>
  );
}
