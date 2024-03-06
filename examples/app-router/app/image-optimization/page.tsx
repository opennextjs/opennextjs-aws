import Image from "next/image";

export default function ImageOptimization() {
  return (
    <div>
      <Image
        src="/static/corporate_holiday_card.jpg"
        alt="Corporate Holiday Card"
        width={300}
        height={300}
      />
    </div>
  );
}
