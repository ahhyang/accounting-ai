"use client";

import { useEffect, useState } from "react";

type Message = {
  id: string;
  body: string;
  isFromAccountant: boolean;
  createdAt: string;
  sender: { name: string };
  sourceDocument: { fileName: string | null } | null;
};

export default function ClientMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");

  async function load() {
    const data = await fetch("/api/client/messages").then((r) => r.json());
    if (data.ok) setMessages(data.messages);
  }

  useEffect(() => {
    load();
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/client/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
    setBody("");
    await load();
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Messages with your accountant</h1>
        <p className="muted">If something is unclear, your accountant will ask here.</p>
      </section>
      <section className="card">
        {messages.length === 0 ? (
          <p className="muted" style={{ padding: "12px 0" }}>
            No messages yet. Your accountant will write here if a document needs a clearer copy.
          </p>
        ) : (
          <ul className="checklist">
            {messages.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>
                    {m.isFromAccountant ? "Accountant" : "You"} — {m.sender.name}
                  </strong>
                  <div>{m.body}</div>
                  {m.sourceDocument?.fileName && (
                    <div className="muted">File: {m.sourceDocument.fileName}</div>
                  )}
                </div>
                <span className="muted">{new Date(m.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
        <form className="form grid" onSubmit={send} style={{ marginTop: 16 }}>
          <label>
            {messages.length === 0 ? "Send a message" : "Reply"}
            <input value={body} onChange={(e) => setBody(e.target.value)} required />
          </label>
          <button className="btn" type="submit">
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
