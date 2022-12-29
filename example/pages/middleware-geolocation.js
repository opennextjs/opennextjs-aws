import { useRouter } from "next/router";
import Layout from "../components/layout";

export default function Page() {
  return (
    <Layout>
      <article>
        <h1>
          Middleware - geolocation
        </h1>
        <hr />
        <p>
          <b>Test 1:</b>
          URL query contains country, city, and region: {JSON.stringify(useRouter().query)}
        </p>
      </article>
    </Layout>
  );
}
