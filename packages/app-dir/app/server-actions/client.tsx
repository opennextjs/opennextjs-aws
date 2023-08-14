'use client'
import { getSong } from '@open-next/core/api'
import { useCallback, useState, useTransition } from 'react'
import Song from '@open-next/core/components/Album/Song'
import type { Song as SongType } from '@open-next/core/api'
export default function Client() {

  const [isPending, startTransition] = useTransition()
  const [song, setSong] = useState<SongType>()

  const onClick = useCallback(() => {
    startTransition(async () => {
      const song = await getSong('Hold Me In Your Arms', "I'm never gonna give you up")
      setSong(song)
    })
  }, [])

  return <div>
    <button onClick={onClick}>Fire Server Actions</button>
    {isPending && <div>☎️ing Server Actions...</div>}
    {song && <Song song={song} play />}
  </div>
}