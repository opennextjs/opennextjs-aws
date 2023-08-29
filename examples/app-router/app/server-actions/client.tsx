"use client";
import { useCallback, useState, useTransition } from "react";

import type { Song as SongType } from "@example/shared/api";
import { getSong } from "@example/shared/api";
import Song from "@example/shared/components/Album/Song";

export default function Client() {
  const [isPending, startTransition] = useTransition();
  const [song, setSong] = useState<SongType>();

  const onClick = useCallback(() => {
    startTransition(async () => {
      const song = await getSong(
        "Hold Me In Your Arms",
        "I'm never gonna give you up",
      );
      setSong(song);
    });
  }, []);

  return (
    <div>
      <button onClick={onClick}>Fire Server Actions</button>
      {isPending && <div>☎️ing Server Actions...</div>}
      {song && <Song song={song} play />}
    </div>
  );
}
