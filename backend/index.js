import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Setup uploads folder and multer
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, "uploads");
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });
app.use("/uploads", express.static(uploadDir));

app.post("/api/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    const response = await fetch(
      `${process.env.MODEL_URL}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.MODEL_ID,
          messages: [
            { role: "user", content: userMessage }
          ]
        })
      }
    );

    const data = await response.json();
    const reply =
      data.choices?.[0]?.message?.content || "No response";

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept audio upload and return a transcription (mock or forwarded)
app.post("/api/speech", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file" });

    // If environment has a speech model URL, forward the file there.
    if (process.env.SPEECH_MODEL_URL) {
      // For brevity, this example returns mock response — implement forwarding as needed.
      return res.json({ transcript: "(forwarding to external speech model not implemented)" });
    }

    // Mock transcription: just return a placeholder using filename
    const transcript = `Transcribed audio: ${req.file.filename}`;
    res.json({ transcript });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept image uploads and return accessible URL
app.post("/api/image-upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image file" });
    const url = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

    // Optionally forward to vision model if configured
    if (process.env.VISION_MODEL_URL) {
      // Placeholder: implement forwarding if you have an API
      return res.json({ url, info: "vision forwarding not implemented" });
    }

    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Streamed chat endpoint — forwards model stream to client as Server-Sent Events (SSE)
app.get('/api/chat-stream', async (req, res) => {
  const message = req.query.message;
  if (!message) return res.status(400).send('No message');

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  try {
    const modelRes = await fetch(`${process.env.MODEL_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.MODEL_ID,
        messages: [{ role: 'user', content: message }],
        stream: true
      })
    });

    if (!modelRes.ok) {
      const errText = await modelRes.text();
      res.write(`event: error\ndata: ${JSON.stringify({ error: errText })}\n\n`);
      return res.end();
    }

    // Handle WHATWG stream reader (modern node-fetch / fetch API)
    if (modelRes.body && modelRes.body.getReader) {
      const reader = modelRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let payload = line;
          if (payload.startsWith('data: ')) payload = payload.slice(6);
          if (payload === '[DONE]') {
            res.write('event: done\ndata: [DONE]\n\n');
            res.end();
            return;
          }
          try {
            const j = JSON.parse(payload);
            let text = '';
            const choices = j.choices;
            if (choices && choices[0]) {
              const delta = choices[0].delta || choices[0].message || {};
              text = delta.content || j.text || '';
            } else if (j.text) text = j.text;
            if (text) {
              const words = String(text).split(/(\s+)/);
              for (const w of words) {
                const safe = w.replace(/\n/g, '\\n');
                res.write(`data: ${safe}\n\n`);
              }
            } else {
              res.write(`data: ${payload}\n\n`);
            }
          } catch (err) {
            // Not JSON — forward raw
            res.write(`data: ${payload}\n\n`);
          }
        }
      }
    } else {
      // Fallback for Node streams
      const decoder = new TextDecoder();
      for await (const chunk of modelRes.body) {
        const textChunk = decoder.decode(chunk);
        res.write(`data: ${textChunk}\n\n`);
      }
    }

    res.write('event: done\ndata: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// Bind to all interfaces so the server is reachable externally
const port = process.env.PORT || 5000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Backend running on ${port}`);
});

