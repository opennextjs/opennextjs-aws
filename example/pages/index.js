import Head from "next/head";
import Link from "next/link";

import Layout, { siteTitle } from "../components/layout";

export default function Home({}) {
  return (
    <Layout home>
      <Head>
        <title>{siteTitle}</title>
      </Head>

      <header>
        <h1>Next.js Feature Test App</h1>
        <p>
          This app contains a handful of pages. Each page implements a specific
          Next.js feature. Deploy this app. Then select a test below to check if
          the feature works.
        </p>
        <hr />
      </header>
      <section>
        <Link href={"/ssg"}>Static Site Generation (SSG)</Link>
        <br />
        <Link href={"/ssg-dynamic/1"}>
          Static Site Generation — with dynamic routes
        </Link>
        <br />
        <Link href={"/ssg-dynamic-fallback/1"}>
          Static Site Generation — with dynamic route fallback
        </Link>
        <br />
        {/*
          <Link href={`/ssg-preview/hello`}>Static Site Generation (Preview Mode)</Link>
          <Link href={`/ssg-preview/world`}>Static Site Generation (Preview Mode)</Link>
        */}
        <Link href={`/isr`}>Incremental Static Regeneration (ISR)</Link>
        <br />
        <Link href={`/ssr`}>Server Side Rendering (SSR)</Link>
        <br />
        <Link href={`/ssr-redirect`}>Server Side Rendering — redirect</Link>
        <br />
        <Link href={`/ssr-not-found`}>
          Server Side Rendering — page not found
        </Link>
        <br />
        <Link href={`/api-route`}>API Route</Link>
        <br />
        <Link href={`/middleware-rewrite`}>Middleware — rewrite</Link>
        <br />
        <Link href={`/middleware-redirect`}>Middleware — redirect</Link>
        <br />
        <Link href={`/middleware-set-header`}>Middleware — set header</Link>
        <br />
        <Link href={`/middleware-geolocation`}>Middleware — geolocation</Link>
        <br />
        <Link href={`/next-auth`}>NextAuth</Link>
        <br />
        <Link href={`/image-optimization-imported`}>
          Image Optimization — imported image
        </Link>
        <br />
        <Link href={`/image-optimization-remote`}>
          Image Optimization — remote image
        </Link>
        <br />
        <Link href={`/image-html-tag`}>Image using html image tag</Link>
        <br />
        <Link href={`/font-css-font`}>Font — CSS Font</Link>
        <br />
        <Link href={`/font-next-font`}>Font — next/font</Link>
        <br />
        <Link href={`/page-does-not-exist`}>404 Page not found</Link>
        <br />
      </section>
    </Layout>
  );
}
