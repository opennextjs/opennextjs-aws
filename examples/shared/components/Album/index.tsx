import Link from "next/link";

import type { Album } from "../../api/index";
import Song from "./Song";

type Props = {
  album: Album;
};
export default function Album({ album }: Props) {
  return (
    <div className="border p-2 my-4 mx-2">
      <div>Album: {album.album}</div>
      <div>Artist: {album.artist}</div>
      {album.songs.map((song) => (
        <Link href={`/albums/${encodeURIComponent(album.album)}/${song.title}`}>
          <Song song={song} />
        </Link>
      ))}
    </div>
  );
}
