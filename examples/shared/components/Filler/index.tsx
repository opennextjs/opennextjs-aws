interface FillerProps {
  // Size in kb of the filler
  size: number;
}

//This component is there to demonstrate how you could bypass streaming buffering in aws lambda.
//Hopefully, this will be fixed in the future and this component will be removed.
// https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/issues/94
export default function Filler({ size }: FillerProps) {
  const str = "a".repeat(size * 1024);
  const byteSize = new TextEncoder().encode(str).length;
  return (
    <script type="application/json">
      {JSON.stringify({ filler: str, byteSize })}
    </script>
  );
}
