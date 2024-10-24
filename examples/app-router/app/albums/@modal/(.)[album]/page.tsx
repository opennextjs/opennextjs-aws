import Modal from "@example/shared/components/Modal";

type Props = {
  params: Promise<{
    artist: string;
  }>;
};
export default async function ArtistPage(props: Props) {
  const params = await props.params;
  return <Modal>Artists {params.artist}</Modal>;
}
