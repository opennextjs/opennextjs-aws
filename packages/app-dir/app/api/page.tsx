"use client";

import { useCallback, useState } from "react";

/**
 * Make /api/hello call exclusively on the client
 * - we already know SSR can fetch itself w/o issues
 */
export default function Page() {
  const [data, setData] = useState();

  const onClientClick = useCallback(async () => {
    const { protocol, host } = window.location;
    const url = `${protocol}//${host}`;
    const r = await fetch(`${url}/api/client`);
    const d = await r.json();
    setData(d);
  }, []);

  const onMiddlewareClick = useCallback(async () => {
    const { protocol, host } = window.location;
    const url = `${protocol}//${host}`;
    const r = await fetch(`${url}/api/middleware`);
    const d = await r.json();
    setData(d);
  }, []);

  return (
    <div>
      <div>API: {data ? JSON.stringify(data, null, 2) : "N/A"}</div>

      <button className="border p-2" onClick={onClientClick}>
        Call /api/client
      </button>
      <button className="border p-2" onClick={onMiddlewareClick}>
        Call /api/middleware
      </button>
    </div>
  );
}
