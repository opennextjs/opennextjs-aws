/**
 * Render the integration fixture's document.
 *
 * @param props Layout props containing the page.
 * @returns The HTML document.
 */
export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
