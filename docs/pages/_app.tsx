import "../styles/normalize.css";
import "../styles/globals.css";

import { Open_Sans } from "@next/font/google";
import type { AppProps } from "next/app";

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
        <Component {...pageProps} />
      </Layout>
    </>
  );
}
