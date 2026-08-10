import { forbidden } from "next/navigation";

export default function Page() {
  forbidden();

  // this should never be rendered
  return <></>;
}
