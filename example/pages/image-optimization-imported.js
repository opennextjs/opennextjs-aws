import Image from "next/image";

import Layout from "../components/layout";
import pic from "../public/images/patrick.1200x1200.png";

export default function Page() {
  return (
    <Layout>
      <article>
        <h1>Image Optimization</h1>
        <hr />
        <Image id="pic" src={pic} width={100} height={100} />
        <p>
          <b>Test 1:</b>
          Original image dimension: 1200 x 1200. Check the dimension of the
          displayed image is smaller than 1200 x 1200.
        </p>
      </article>
    </Layout>
  );
}
