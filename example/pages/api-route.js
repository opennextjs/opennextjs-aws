import useSWR from "swr";

import Layout from "../components/layout";

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Page() {
  const { data } = useSWR("/api/hello", fetcher);
  return (
    <Layout>
      <article>
        <h1>API Route</h1>
        <hr />
        <p>
          <b>Test 1:</b>
          The API response 👉 {JSON.stringify(data)} should be "Hello".
        </p>
      </article>
    </Layout>
  );
}
