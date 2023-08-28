import Layout from "../components/layout";

export async function getServerSideProps(context) {
  return {
    props: {
      qs: JSON.stringify(context.query),
    },
  };
}

export default function Page({ qs }) {
  return (
    <Layout>
      <article>
        <h1>Middleware - geolocation</h1>
        <hr />
        <p>
          <b>Test 1:</b>
          URL query contains country, city, and region: {qs}
        </p>
      </article>
    </Layout>
  );
}
