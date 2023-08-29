import Modal from "@open-next/core/components/Modal";

type Props = {
  params: {
    artist: string;
  };
};
export default function ArtistPage({ params }: Props) {
  return <Modal>Artists {params.artist}</Modal>;
}
