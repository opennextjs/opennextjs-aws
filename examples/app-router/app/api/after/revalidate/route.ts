import { revalidateTag } from "next/cache";
import { NextResponse, after } from "next/server";

export function POST() {
  after(
    () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          // We want to expire the "date" tag immediately
          revalidateTag("date", { expire: 0 });
          resolve();
        }, 5000),
      ),
  );

  return NextResponse.json({ success: true });
}
