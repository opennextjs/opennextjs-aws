"use server";

// For: serverActions.test.ts, only bundled with the edit page
export async function saveDraft(id: string, draft: string) {
  return `Saved draft of item ${id}: ${draft}`;
}
