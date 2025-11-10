"use client";
import { useState } from "react";

import type { ReactNode } from "react";

export default function Layout({
  a,
  b,
  children,
}: {
  children: ReactNode;
  a: ReactNode;
  b: ReactNode;
}) {
  const [routeA, setRouteA] = useState(false);
  const [routeB, setRouteB] = useState(false);

  return (
    <div>
      <div className="flex flex-col items-start mb-10">
        <button onClick={() => setRouteA(!routeA)} data-testid="enable-a">
          {routeA ? "Disable A" : "Enable A"}
        </button>
        <button onClick={() => setRouteB(!routeB)} data-testid="enable-b">
          {routeB ? "Disable B" : "Enable B"}
        </button>
      </div>

      {routeA && a}
      {routeB && b}
      {/* {children} */}
    </div>
  );
}
