import { signIn, signOut, useSession } from "next-auth/react";

import Layout from "../components/layout";

function LoginButton() {
  const { data: session } = useSession();
  if (session) {
    return (
      <>
        Signed in as {session.user.email} <br />
        <button onClick={() => signOut()}>Sign out</button>
      </>
    );
  }
  return (
    <>
      Not signed in <br />
      <button onClick={() => signIn()}>Sign in</button>
    </>
  );
}

export default function Page() {
  return (
    <Layout>
      <article>
        <h1>NextAuth</h1>
        <hr />
        <LoginButton />
        <br />
        <p>
          <b>Test 1:</b> Sign in, and your email is displayed.
          <br />
          <b>Test 2:</b> Sign out, and your email is cleared.
        </p>
      </article>
    </Layout>
  );
}
