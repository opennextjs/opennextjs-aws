import type { NextRequest } from "next/server";

// You can opt-in to caching by using a route config option
// Good to know: Other supported HTTP methods are not cached, even if they are placed alongside a GET method that is cached, in the same file.
// export const dynamic = "force-static";
// However in Next right now this is an issue
// I opened an issue here: https://github.com/vercel/next.js/issues/77185

// This route should be cached if you uncomment line 5
export async function GET() {
  return Response.json({
    message: "OpenNext is awesome! :) :] :> :D",
  });
}

export async function POST(request: Request) {
  const text = await request.text();
  if (text === "OpenNext is awesome! :] :) :> :D") {
    return Response.json(
      {
        message: "ok",
      },
      {
        status: 202,
      },
    );
  }
  return Response.json({ message: "forbidden" }, { status: 403 });
}

export async function PUT(request: Request) {
  const res = (await request.json()) as {
    message: string;
  };
  if (res.message === "OpenNext PUT") {
    return Response.json({ message: "ok" }, { status: 201 });
  }
  return Response.json({ message: "error" }, { status: 500 });
}

export async function PATCH(request: Request) {
  const res = (await request.json()) as {
    message: string;
  };
  if (res.message === "OpenNext PATCH") {
    return Response.json(
      { message: "ok", modified: true, timestamp: new Date().toISOString() },
      { status: 202 },
    );
  }
  return Response.json({ message: "error" }, { status: 500 });
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const command = searchParams.get("command");
  if (command === "rm -rf / --no-preserve-root") {
    return new Response(null, { status: 204 });
  }
  return Response.json({ message: "error" }, { status: 500 });
}

export async function HEAD() {
  return new Response("hello", {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Once deployed to AWS this will always be 0
      // "content-length": "1234567",
      "special-header": "OpenNext is the best :) :] :> :D",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS, LOVE",
      Special: "OpenNext is the best :) :] :> :D",
    },
  });
}
