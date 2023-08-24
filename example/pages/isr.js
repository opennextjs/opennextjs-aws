import Layout from "../components/layout";

export async function getStaticProps() {
  return {
    props: {
      time: Date.now(),
    },
    revalidate: 10,
  };
}

export default function Page({ time }) {
  return (
    <Layout>
      <article>
        <h1>Incremental Static Rendering (ISR)</h1>
        <hr />
        <p>
          <b>Test 1:</b>
          This timestamp 👉 {time} should change every 10 seconds when the page
          is repeatedly refreshed.
        </p>
      </article>
    </Layout>
  );
}
