"use server";
import data from "./songs.json";

export type Song = (typeof data.songs)[0];
export type Album = { album: string; artist: string; songs: Song[] };
const albumsMap: { [key: string]: Song[] } = {};

const albums: Album[] = [];
data.songs.forEach((s) => {
  if (!albumsMap[s.album]) {
    albumsMap[s.album] = [s];
  } else {
    albumsMap[s.album].push(s);
  }
});

Object.entries(albumsMap).forEach(([key, album]) => {
  albums.push({
    album: album[0].album,
    artist: album[0].artist,
    songs: album,
  });
});

export async function getAlbums() {
  return albums;
}

export async function getSongs() {
  return data.songs;
}

export async function getSong(album: string, title: string) {
  return data.songs.find(
    (song) =>
      song.album === decodeURIComponent(album) &&
      song.title === decodeURIComponent(title),
  );
}
