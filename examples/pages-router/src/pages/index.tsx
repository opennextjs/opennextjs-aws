import Nav from "@example/shared/components/Nav";
import { Inter } from "@next/font/google";
import Head from "next/head";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  return (
    <>
      <Head>
        <title>Nextjs Pages Router</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
        <h1>Nextjs Pages Router</h1>
        <div className="grid grid-cols-2 mt-2 [&>*]:mx-4">
          <Nav href="/isr" title="/ISR" icon="/static/frank.webp">
            revalidates every 10 seconds
          </Nav>
          <Nav href="/ssr" title="/SSR" icon="/static/frank.webp">
            SSR on each load
          </Nav>
        </div>
      </main>
    </>
  );
}
