import { useEffect, useRef, useState } from "react";
import "./App.css";
import assistantImg from "./assets/assistant.svg";

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi! I'm your virtual assistant — how can I help?", time: Date.now() }
  ]);
  const [dark, setDark] = useState(true);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState(null);
  const streamRef = useRef(null);
  const endRef = useRef(null);

  // human-friendly short time (relative)
  const timeAgo = (ts) => {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const sec = Math.floor(diff / 1000);
    if (sec < 5) return 'now';
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec/60)}m`;
    if (sec < 86400) return `${Math.floor(sec/3600)}h`;
    return new Date(ts).toLocaleDateString();
  };

  const copyMessage = async (text, idx) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      console.warn('copy failed', e);
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interim]);

  // Setup Web Speech API recognition if available
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaChunksRef = useRef([]);
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = true;
    r.onresult = (e) => {
      let interimText = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      setInterim(interimText);
      if (finalText) {
        setInterim("");
        setListening(false);
        sendTextMessage(finalText);
      }
    };
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    return () => {
      try { r.onresult = null; r.onend = null; } catch (e) {}
    };
  }, []);

  // Setup MediaRecorder fallback when SpeechRecognition is not available
  useEffect(() => {
    if (window.SpeechRecognition || window.webkitSpeechRecognition) return;
    // nothing to prepare here; we'll request microphone on start
  }, []);

  const sendTextMessage = async (text) => {
    if (!text || !text.trim()) return;
    // add user message
    setMessages(prev => [...prev, { role: "user", text, time: Date.now() }]);

    // append an empty assistant message we'll fill progressively
    setMessages(prev => [...prev, { role: "assistant", text: "", time: Date.now() }]);
    setStreaming(true);

    // close previous stream if any
    if (streamRef.current) {
      try { streamRef.current.close(); } catch (e) {}
      streamRef.current = null;
    }

    // EventSource to backend SSE endpoint
    const url = `/api/chat-stream?message=${encodeURIComponent(text)}`;
    const es = new EventSource(url);
    streamRef.current = es;

    es.onmessage = (e) => {
      // e.data contains small chunks (we send words/spaces)
      const chunk = e.data.replace(/\\n/g, '\n');
      setMessages(prev => {
        const msgs = [...prev];
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') {
            msgs[i] = { ...msgs[i], text: (msgs[i].text || '') + chunk };
            break;
          }
        }
        return msgs;
      });
    };

    es.addEventListener('done', () => {
      setStreaming(false);
      try { es.close(); } catch (e) {}
      streamRef.current = null;
    });

    es.addEventListener('error', (ev) => {
      setStreaming(false);
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error: streaming failed.', time: Date.now() }]);
      try { es.close(); } catch (e) {}
      streamRef.current = null;
    });
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const t = input;
    setInput("");
    await sendTextMessage(t);
  };

  const onKeyDown = e => {
    if (e.key === "Enter") sendMessage();
  };

  const toggleListening = () => {
    const r = recognitionRef.current;
    if (r) {
      if (listening) {
        try { r.stop(); } catch (e) {}
        setListening(false);
      } else {
        try { r.start(); setListening(true); setInterim(""); } catch (e) { console.warn(e); }
      }
      return;
    }

    // Fallback: use MediaRecorder
    if (listening) {
      // stop recorder
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") mr.stop();
      setListening(false);
      return;
    }

    // start recorder
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const mr = new MediaRecorder(stream);
      mediaChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) mediaChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' });
        // send to backend /api/speech
        const fd = new FormData();
        fd.append('audio', blob, 'recording.webm');
        try {
          const res = await fetch('/api/speech', { method: 'POST', body: fd });
          const data = await res.json();
          const transcript = data.transcript || '';
          if (transcript) {
            setMessages(prev => [...prev, { role: 'user', text: transcript, time: Date.now() }]);
            // Also send to chat to get assistant reply
            await sendTextMessage(transcript);
          }
        } catch (err) {
          setMessages(prev => [...prev, { role: 'assistant', text: 'Error sending audio.', time: Date.now() }]);
        }
        // stop tracks
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setListening(true);
    }).catch(err => {
      alert('Microphone access denied or not available');
    });
  };

  // Image upload
  const uploadImage = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file, file.name);
    try {
      const res = await fetch('/api/image-upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.url) {
        setMessages(prev => [...prev, { role: 'user', image: data.url, time: Date.now() }]);
        // Optionally tell assistant about image
        await sendTextMessage(`User uploaded an image: ${data.url}`);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Image upload failed.', time: Date.now() }]);
    }
  };

  return (
    <div className={`assistant-app ${dark ? "dark" : ""}`}>
      <aside className="assistant-side">
        <img src={assistantImg} alt="assistant" className="assistant-avatar" />
        <h3>Gemma</h3>
        <p className="assistant-desc">Your AI helper — ask anything or upload an image.</p>
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <div>
            <div style={{fontSize: '1rem'}}>Virtual Assistant</div>
            <div style={{fontSize: '0.8rem', color: 'var(--muted)'}}>Ask anything — results stream in as they’re generated</div>
          </div>
          <div className="header-actions">
            <button className="new-chat" onClick={() => setMessages([{ role: 'assistant', text: "Hi! I'm your virtual assistant — how can I help?", time: Date.now() }])}>New</button>
            <button className="theme-toggle" onClick={() => setDark(d => !d)} aria-pressed={dark}>
              {dark ? "🌙" : "☀️"}
            </button>
          </div>
        </header>

        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              <div className="msg-avatar-wrap">
                {m.role === 'assistant' ? (
                  <img src={assistantImg} alt="assistant" className="msg-avatar" />
                ) : (
                  <div className="msg-avatar user-avatar">You</div>
                )}
              </div>
              <div className="msg-content">
                <div className="bubble">
                  {m.image ? (
                    <img src={m.image} alt={`upload-${i}`} style={{ maxWidth: '240px', borderRadius: 8 }} />
                  ) : (
                    m.text
                  )}
                </div>
                <div className="msg-meta">
                  <span className="time">{m.time ? timeAgo(m.time) : ''}</span>
                  {m.text ? (
                    <button className={`copy-btn ${copied === i ? 'copied' : ''}`} onClick={() => copyMessage(m.text, i)} aria-label="Copy message">
                      {copied === i ? 'Copied' : 'Copy'}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))} 
          {interim && (
            <div className="message user interim">
              <div className="bubble">{interim}…</div>
            </div>
          )}

          {streaming && (
            <div className="message assistant">
              <div className="bubble typing">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        <div className="input-row">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message..."
          />
          <label className="file-upload">
            📁
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadImage(e.target.files[0])} />
          </label>
          <button className={`mic ${listening ? 'listening' : ''}`} onClick={toggleListening} title="Start/stop voice">{listening ? '●' : '🎙'}</button>
          <button onClick={sendMessage}>Send</button>
        </div>
      </main>
    </div>
  );
}

export default App;

