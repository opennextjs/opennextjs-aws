import { MuseoModerno } from "next/font/google";

import Layout from "../components/layout";

const museo = MuseoModerno({
  subsets: ["latin"],
  weight: "400",
});

export default function Page() {
  return (
    <Layout>
      <article>
        <h1>Font — next/font</h1>
        <p>
          <b>Test 1:</b>
        </p>
        <p>This uses default font.</p>
        <p className={museo.className}>This uses MuseoModerno font.</p>
      </article>
    </Layout>
  );
}
