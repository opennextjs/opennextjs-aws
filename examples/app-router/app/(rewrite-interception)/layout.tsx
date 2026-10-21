import type { ReactNode } from "react";

/**
 * Renders the rewrite-interception fixture with its parallel modal slot.
 *
 * @param props The route content and modal slot
 * @returns The combined route layout
 */
export default function RewriteInterceptionLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <div>
      {children}
      {modal}
    </div>
  );
}
