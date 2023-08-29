import { getAlbums } from "@open-next/core/api";
import Album from "@open-next/core/components/Album";

export default async function AlbumPage() {
  const albums = await getAlbums();
  return (
    <div>
      {albums.map((album) => (
        <Album album={album} />
      ))}
    </div>
  );
}
