/*
 * When doing `next build` you would get the error below:
 * TypeScript error: Property 'amp-timeago' does not exist on type 'JSX.IntrinsicElements'.
 * https://stackoverflow.com/questions/50585952/property-amp-img-does-not-exist-on-type-jsx-intrinsicelements/50601125#50601125
 * The workaround in that SO post doesn't work in this (mono)repo so I ended up using @ts-expect-error and @ts-ignore
 *
 */

export const config = { amp: true };

export async function getServerSideProps() {
  return {
    props: {
      time: new Date().toISOString(),
    },
  };
}

function MyAmpPage({ time }: { time: string }) {
  const date = new Date(time);

  return (
    <div>
      <p>Some time: {date.toJSON()}</p>
      {/* @ts-expect-error AMP Component not recognized by TypeScript */}
      <amp-timeago
        width="0"
        height="15"
        datetime={date.toJSON()}
        layout="responsive"
        data-testid="amp-timeago"
      >
        .{/* @ts-ignore */}
      </amp-timeago>
    </div>
  );
}

export default MyAmpPage;
