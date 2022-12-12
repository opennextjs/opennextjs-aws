import Layout from "../components/layout";

export default function Page() {
  return (
    <Layout>
      <article>
        <h1>
          Middleware - redirect
        </h1>
        <hr />
        <p>
          <b>Test 1:</b>
          If you see this page, Middleware with redirect is NOT working. You should be redirected to /middleware-redirect-destination.
        </p>
      </article>
    </Layout>
  );
}
