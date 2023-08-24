import Image from "next/image";

import Layout from "../components/layout";

export default function Page() {
  return (
    <Layout>
      <article>
        <h1>Image Optimization</h1>
        <hr />
        <Image
          id="pic"
          src="https://images.unsplash.com/photo-1632730038107-77ecf95635ab"
          width={100}
          height={100}
        />
        <p>
          <b>Test 1:</b>
          Original image dimension: 2268 x 4032. Check the dimension of the
          displayed image is smaller than 256 x 455.
        </p>
      </article>
    </Layout>
  );
}
