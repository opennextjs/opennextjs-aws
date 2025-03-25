"use client";

import { useEffect, useState } from "react";

type Event = {
  type: "start" | "content" | "complete";
  model?: string;
  body?: string;
};

export default function SSE() {
  const [events, setEvents] = useState<Event[]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const e = new EventSource("/api/streaming");

    e.onmessage = (msg) => {
      console.log(msg);
      try {
        const data = JSON.parse(msg.data) as Event;
        if (data.type === "complete") {
          e.close();
          setFinished(true);
        }
        if (data.type === "content") {
          setEvents((prev) => prev.concat(data));
        }
      } catch (err) {
        console.error(err, msg);
      }
    };
  }, []);

  return (
    <div
      style={{
        padding: "20px",
        marginBottom: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "40px",
      }}
    >
      <h1
        style={{
          fontSize: "2rem",
          marginBottom: "20px",
        }}
      >
        Sade - Smooth Operator
      </h1>
      <div>
        {events.map((e, i) => (
          <p data-testid="line" key={i}>
            {e.body}
          </p>
        ))}
      </div>
      {finished && (
        <iframe
          data-testid="video"
          width="560"
          height="315"
          src="https://www.youtube.com/embed/4TYv2PhG89A?si=e1fmpiXZZ1PBKPE5"
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        ></iframe>
      )}
    </div>
  );
}
