export default function RedirectDestination() {
  return (
    <div>
      <h1>I was redirected from next.config.js</h1>
      <p>/next-config-redirect =&gt; /config-redirect</p>
      <a
        data-testid="redirect-link"
        href="/next-config-redirect-encoding?q=äöå€"
      >
        /next-config-redirect-encoding?q=äöå€
      </a>
      <a
        data-testid="redirect-link-already-encoded"
        href="/next-config-redirect-encoding?q=%C3%A4%C3%B6%C3%A5%E2%82%AC"
      >
        /next-config-redirect-encoding?q=%C3%A4%C3%B6%C3%A5%E2%82%AC
      </a>
    </div>
  );
}
