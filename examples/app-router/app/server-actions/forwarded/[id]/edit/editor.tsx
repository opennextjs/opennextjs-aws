"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { saveDraft } from "../../actions";

export default function Editor({ id }: { id: string }) {
  const draft = useRef("");
  // Enabled once hydrated, so that the draft is tracked and the link navigates on the client.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  // The draft is saved when the editor unmounts. After a client navigation the action is posted
  // to the new page, which does not bundle it.
  useEffect(() => {
    return () => {
      saveDraft(id, draft.current);
    };
  }, [id]);

  return (
    <div>
      <textarea
        aria-label="Draft"
        disabled={!hydrated}
        onChange={(e) => {
          draft.current = e.target.value;
        }}
      />
      <Link href={`/server-actions/forwarded/${id}`}>Back to item</Link>
    </div>
  );
}
