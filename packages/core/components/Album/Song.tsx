import type { Song } from "../../api/index";

type Props = {
  song: Song;
  play?: boolean;
};
export default function Song({ song, play }: Props) {
  return (
    <div className="border p-1 hover:bg-green-600">
      <div>Song: {song.title}</div>
      <div>Year: {song.year}</div>
      {play && (
        <iframe
          width="560"
          height="315"
          title={song.title}
          allowFullScreen
          src={`https://youtube.com/embed/${song?.videoId}?autoplay=1`}
        ></iframe>
      )}
    </div>
  );
}
