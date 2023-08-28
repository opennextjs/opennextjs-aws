import Layout from "../components/layout";

export async function getStaticProps() {
  return {
    props: {
      time: new Date().toISOString(),
    },
  };
}

export default function Page({ time }) {
  return (
    <Layout>
      <article>
        <h1>Static Site Generation (SSG)</h1>
        <hr />
        <p>
          <b>Test 1:</b>
          This timestamp 👉 {time} should be when the `npx open-next build` was
          run, not when the page is refreshed. Hence, this time should not
          change on refresh.js
        </p>
        <p>
          <b>Test 2:</b>
          Check your browser's developer console. the request might show cache
          MISS on first load. Subsequent refreshes should shows cache HIT.
        </p>
      </article>
    </Layout>
  );
}
