import { unauthorized } from "next/navigation";

export default function Page() {
  unauthorized();

  // this should never be rendered
  return <></>;
}
