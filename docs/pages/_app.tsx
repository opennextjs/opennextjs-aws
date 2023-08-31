import "../styles/normalize.css";
import "../styles/globals.css";

import type { AppProps } from "next/app";
import { Open_Sans } from "next/font/google";

import Layout from "../components/Layout";

const open = Open_Sans({ subsets: ["latin"] });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <style jsx global>{`
        :root {
          --font-body: ${open.style.fontFamily}, sans-serif;
        }
      `}</style>
      <Layout>
        {/* @ts-ignore */}
        <Component {...pageProps} />
      </Layout>
    </>
  );
}
