import { revalidateTag } from "next/cache";
import { NextResponse, after } from "next/server";

export function POST() {
  after(
    () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          revalidateTag("date");
          resolve();
        }, 5000),
      ),
  );

  return NextResponse.json({ success: true });
}
