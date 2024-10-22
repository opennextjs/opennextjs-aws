import Image from "next/image";

export default function ImageOptimization() {
  return (
    <div>
      <Image
        src="https://opennext.js.org/architecture.png"
        alt="Open Next architecture"
        width={300}
        height={300}
      />
    </div>
  );
}
