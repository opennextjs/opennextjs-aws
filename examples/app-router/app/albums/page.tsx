import { getAlbums } from "@example/shared/api";
import Album from "@example/shared/components/Album";

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
