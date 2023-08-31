import { getSong } from "@example/shared/api";

type Props = {
  params: {
    album: string;
    song: string;
  };
};
export default async function Song({ params }: Props) {
  const song = await getSong(params.album, params.song);

  return (
    <div>
      <h1>Not Modal</h1>
      {decodeURIComponent(params.album)}
      <iframe
        width="560"
        height="315"
        allowFullScreen
        src={`https://youtube.com/embed/${song?.videoId}?autoplay=1`}
      ></iframe>
    </div>
  );
}
