const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
require("dotenv").config();

const graphRouter = require("./routes/graph");
const nodeRouter = require("./routes/node");
const { handleChat } = require("./routes/chat");

const app = express();
const server = http.createServer(app);

// ─── MIDDLEWARE ───────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ─── HEALTH CHECK ────────────────────────────────────────
// Render / Railway ping this to keep the service alive
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── REST ROUTES ─────────────────────────────────────────
app.use("/api/graph", graphRouter);
app.use("/api/node", nodeRouter);

const path = require("path");

// Serve frontend build
app.use(express.static(path.join(__dirname, "../frontend/dist")));

app.get("/(.*)", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

// ─── WEBSOCKET /ws/chat ───────────────────────────────────
const wss = new WebSocket.Server({ server, path: "/ws/chat" });

// BUG FIX: Track concurrent chat sessions per connection.
// Without this, spamming messages while a response is streaming
// causes multiple overlapping handleChat calls on the same ws socket.
wss.on("connection", (ws) => {
  console.log("WebSocket client connected");
  let busy = false;

  ws.on("message", async (raw) => {
    // Reject if already processing a message on this connection
    if (busy) {
      ws.send(JSON.stringify({ type: "error", message: "Please wait for the current response to finish." }));
      return;
    }

    try {
      const { message, history = [] } = JSON.parse(raw);

      if (!message || typeof message !== "string") {
        ws.send(JSON.stringify({ type: "error", message: "No message provided" }));
        ws.send(JSON.stringify({ type: "done" }));
        return;
      }

      // Sanitize: trim and cap length
      const sanitized = message.trim().slice(0, 1000);

      busy = true;
      await handleChat(sanitized, history, ws);
    } catch (err) {
      console.error("WebSocket handler error:", err);
      ws.send(JSON.stringify({ type: "error", message: `Error: ${err.message}` }));
      ws.send(JSON.stringify({ type: "done" }));
    } finally {
      busy = false;
    }
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

// ─── GRACEFUL SHUTDOWN ───────────────────────────────────
// BUG FIX: Without this, the process hangs on Ctrl+C / container stop
// because the PostgreSQL pool and WebSocket server keep the event loop alive.
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  console.log("Shutting down gracefully...");
  wss.close(() => {
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });
  // Force exit after 5 seconds if graceful shutdown hangs
  setTimeout(() => process.exit(1), 5000);
}

// ─── START ────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket running on ws://localhost:${PORT}/ws/chat`);
});