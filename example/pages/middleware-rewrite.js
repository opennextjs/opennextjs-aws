import Layout from "../components/layout";

export async function getServerSideProps(context) {
  return {
    props: {
      isRewritten: context.query.rewritten === "true" ? "✅" : "❌",
    },
  };
}

export default function Page({ isRewritten }) {
  return (
    <Layout>
      <article>
        <h1>Middleware - rewrite</h1>
        <hr />
        <p>
          <b>Test 1:</b>URL is rewritten {isRewritten}
        </p>
      </article>
    </Layout>
  );
}
