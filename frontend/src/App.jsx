import { useState } from "react";

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);

  const sendMessage = async () => {
    if (!input) return;

    setMessages([...messages, { role: "user", text: input }]);

    const res = await fetch("http://44.223.169.80:5000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input })
    });

    const data = await res.json();

    setMessages(prev => [
      ...prev,
      { role: "assistant", text: data.reply }
    ]);

    setInput("");
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Gemma 3 Chat</h2>

      <div>
        {messages.map((m, i) => (
          <p key={i}>
            <b>{m.role}:</b> {m.text}
          </p>
        ))}
      </div>

      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Ask something..."
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}

export default App;

