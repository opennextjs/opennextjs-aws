import Nav from "@example/shared/components/Nav";

export default function Home() {
  return (
    <>
      <h1>Nextjs App Router</h1>

      <main className="grid grid-cols-2 gap-4 p-10 [&>a]:border">
        <Nav href={"/albums"} title="Albums">
          Modal and interception of the greatest hits
        </Nav>
        <Nav href={"/rewrite"} title="Rewrite">
          Middleware Rewrite of a page. /rewrite should rewrite the contents of
          /rewrite-destination
        </Nav>
        <Nav href={"/redirect"} title="Redirect">
          Middleware Rewrite of a page. /redirect should redirect page to
          /redirect-destination
        </Nav>
        <Nav href={"/server-actions"} title="Server Actions">
          Client component imports a 'use server' server action and calls it
          directly without setting up any api endpoints
        </Nav>
        <Nav href={"/isr"} title="ISR">
          Incremental Static Regeneration revalidates every 10 seconds with a
          new timestamp
        </Nav>
        <Nav href={"/ssr"} title="SSR">
          Server Side Render should generate a new timestamp on each load
        </Nav>
        <Nav href={"/api"} title="API">
          Calls an API endpoint defined in app/api/hello/route and middleware
        </Nav>
        <Nav href={"/parallel"} title="Parallel">
          Parallel routing
        </Nav>
        <Nav href={"/headers"} title="Headers">
          Headers from middleware should be available via headers()
        </Nav>
        <Nav href={"/search-query"} title="Search Query">
          Search Query Params should be available in middleware
        </Nav>
      </main>
    </>
  );
}
