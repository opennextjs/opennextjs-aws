import dayjs from "dayjs";
import LocalizedFormat from "dayjs/plugin/localizedFormat";

dayjs.extend(LocalizedFormat);

export default function Date({ dateString }) {
  const date = dayjs(dateString);
  return <time dateTime={dateString}>{date.format("LLLL d, yyyy")}</time>;
}
