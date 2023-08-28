import Layout from "../components/layout";

export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/ssr-redirect-destination",
      permanent: false,
    },
  };
}

export default function Page() {
  return (
    <Layout>
      <article>
        <h1>Server Side Rendering - redirect</h1>
        <hr />
        <p>
          <b>Test 1:</b>
          If you see this page, SSR with redirect is NOT working. You should be
          redirected to /ssr-redirect-destination.
        </p>
      </article>
    </Layout>
  );
}
