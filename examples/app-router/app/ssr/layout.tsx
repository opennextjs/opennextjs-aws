import { PropsWithChildren } from "react";

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div>
      <h1>SSR</h1>
      {/* 16 kb seems necessary here to prevent any buffering*/}
      {/* <Filler size={16} /> */}
      {children}
    </div>
  );
}
