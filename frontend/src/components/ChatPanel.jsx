import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/chat`;

// Suggested starter queries shown on load
const STARTER_QUERIES = [
  "Which products have the most billing documents?",
  "Show me the top 5 customers by revenue",
  "Find sales orders with broken or incomplete flows",
  "What is the total revenue this year?",
];

export default function ChatPanel({ selectedNode, onHighlight }) {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      type: "text",
      text: "Hi! I can help you analyze the Order to Cash process. Ask me anything about orders, deliveries, billing, payments, or customers.",
    },
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("ready");
  const [statusText, setStatusText] = useState("Awaiting instructions");
  const [wsReady, setWsReady] = useState(false);

  const historyRef = useRef([]);
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const streamingIdRef = useRef(null);
  const prevSelectedNodeRef = useRef(null);
  // BUG FIX: reconnect interval ref — clear it on unmount to prevent memory leak
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Node click → suggestion chip
  useEffect(() => {
    if (!selectedNode || selectedNode === prevSelectedNodeRef.current) return;
    prevSelectedNodeRef.current = selectedNode;

    const entity = selectedNode.data?.entity;
    const label = selectedNode.data?.label;
    if (!entity || !label) return;

    const suggestions = {
      Customer:       `Show all orders and billing history for customer "${label}"`,
      SalesOrder:     `Trace the full flow for sales order "${selectedNode.data?.salesOrder}"`,
      BillingDoc:     `What is the status of billing document "${selectedNode.data?.billingDocument}"? Has it been paid?`,
      Delivery:       `Which sales orders and billing documents are linked to delivery "${selectedNode.data?.deliveryDocument}"?`,
      Product:        `Which billing documents are associated with product "${label}"?`,
      JournalEntry:   `Show journal entry and payment details for accounting document "${selectedNode.data?.accountingDocument}"`,
      Payment:        `Show payment details for accounting document "${selectedNode.data?.accountingDocument}"`,
      SalesOrderItem: `What is the delivery and billing status of sales order ${selectedNode.data?.salesOrder} item ${selectedNode.data?.item}?`,
    };

    const suggestion = suggestions[entity];
    if (!suggestion) return;

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + "_node_suggestion",
        role: "assistant",
        type: "suggestion",
        text: suggestion,
        nodeId: selectedNode.id,
      },
    ]);
  }, [selectedNode]);

  // ─── WEBSOCKET ──────────────────────────────────────────
  useEffect(() => {
    let ws;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsReady(true);
        // Clear any pending reconnect timer
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (data.type === "status") {
          setStatusText(data.message);
        }

        if (data.type === "sql") {
          setMessages((prev) => [
            ...prev,
            { id: Date.now() + "_sql", role: "assistant", type: "sql", text: data.message },
          ]);
        }

        if (data.type === "chunk") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.id === streamingIdRef.current) {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + data.message },
              ];
            } else {
              const newId = Date.now() + "_stream";
              streamingIdRef.current = newId;
              return [
                ...prev,
                { id: newId, role: "assistant", type: "text", text: data.message },
              ];
            }
          });
        }

        if (data.type === "highlight" || data.type === "broken") {
          onHighlight && onHighlight(data.ids, data.type);
        }

        if (data.type === "table") {
          setMessages((prev) => [
            ...prev,
            { id: Date.now() + "_table", role: "assistant", type: "table", rows: data.rows },
          ]);
        }

        if (data.type === "module") {
          setMessages((prev) => [
            ...prev,
            { id: Date.now() + "_module", role: "assistant", type: "module", text: data.message },
          ]);
        }

        if (data.type === "blocked") {
          setMessages((prev) => [
            ...prev,
            { id: Date.now() + "_blocked", role: "assistant", type: "blocked", text: data.message },
          ]);
        }

        if (data.type === "error") {
          setMessages((prev) => [
            ...prev,
            { id: Date.now() + "_err", role: "assistant", type: "error", text: data.message },
          ]);
        }

        if (data.type === "done") {
          // BUG FIX: was searching for last assistant/text message, but if the
          // last message was a table, it would store the wrong text in history.
          // Now we explicitly look backwards for the last streamed chunk id.
          setMessages((prev) => {
            const streamedMsg = prev.find((m) => m.id === streamingIdRef.current);
            if (streamedMsg) {
              historyRef.current.push({ role: "assistant", content: streamedMsg.text });
              // Cap conversation history to last 20 turns to avoid huge payloads
              if (historyRef.current.length > 20) {
                historyRef.current = historyRef.current.slice(-20);
              }
            }
            return prev;
          });
          setStatus("ready");
          setStatusText("Awaiting instructions");
          streamingIdRef.current = null;
        }
      };

      ws.onclose = () => {
        setWsReady(false);
        setStatus("ready");
        // BUG FIX: exponential backoff would be ideal, but simple 2s retry is fine
        reconnectTimerRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      ws?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback((overrideMsg) => {
    const msg = (overrideMsg || input).trim();
    if (!msg || status === "loading") return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + "_err", role: "assistant", type: "error", text: "Connection lost. Reconnecting... please try again in a moment." },
      ]);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: Date.now() + "_user", role: "user", type: "text", text: msg },
    ]);

    historyRef.current.push({ role: "user", content: msg });
    setInput("");
    setStatus("loading");
    setStatusText("Thinking...");
    onHighlight && onHighlight([]);

    wsRef.current.send(JSON.stringify({
      message: msg,
      history: historyRef.current.slice(-10),
    }));
  }, [input, status, onHighlight]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Auto-resize textarea
  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      <div className="chat-header">
        <div className="chat-header-title">Chat with Graph</div>
        <div className="chat-agent">
          <div className="agent-avatar">O</div>
          <div className="agent-info">
            <span className="agent-name">O2C Agent</span>
            <span className="agent-role">Graph Agent</span>
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {/* Starter suggestions on first load */}
        {messages.length === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Try asking
            </div>
            {STARTER_QUERIES.map((q, i) => (
              <div
                key={i}
                className="message-suggestion"
                onClick={() => send(q)}
              >
                <span className="suggestion-icon">→</span>
                {q}
              </div>
            ))}
          </div>
        )}

        {messages.map((msg) => (
          <Message key={msg.id} msg={msg} onSuggestionClick={send} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-footer">
        <div className="chat-status-bar">
          <span className={`chat-status-dot ${status === "loading" ? "loading" : ""}`}
            style={!wsReady ? { background: "var(--error)" } : {}}
          />
          <span>{!wsReady ? "Reconnecting..." : statusText}</span>
        </div>
        <div className="chat-input-row">
          <textarea
            className="chat-input"
            placeholder="Ask about orders, billing, payments..."
            value={input}
            onChange={handleInput}
            onKeyDown={onKeyDown}
            disabled={status === "loading" || !wsReady}
            rows={1}
          />
          <button
            className="chat-send-btn"
            onClick={() => send()}
            disabled={status === "loading" || !input.trim() || !wsReady}
          >
            &#8593;
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MESSAGE COMPONENT ────────────────────────────────────
function Message({ msg, onSuggestionClick }) {

  if (msg.type === "suggestion") {
    return (
      <div className="message assistant">
        <div
          className="message-suggestion"
          onClick={() => onSuggestionClick(msg.text)}
          title="Click to ask this"
        >
          <span className="suggestion-icon">→</span>
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.type === "sql") {
    return (
      <div className="message assistant">
        <details style={{ width: "90%" }}>
          <summary style={{
            fontSize: "10px", color: "var(--text-muted)", cursor: "pointer",
            fontFamily: "DM Mono, monospace", marginBottom: "4px",
            userSelect: "none",
          }}>
            ▸ View SQL query
          </summary>
          <pre className="message-sql">{msg.text}</pre>
        </details>
      </div>
    );
  }

  if (msg.type === "table") {
    if (!msg.rows || msg.rows.length === 0) return null;
    const cols = Object.keys(msg.rows[0] || {});
    return (
      <div className="message assistant" style={{ maxWidth: "100%" }}>
        <div style={{
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: "260px",
          borderRadius: "6px",
          border: "1px solid var(--border)",
          fontSize: "11px",
          fontFamily: "DM Mono, monospace",
        }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "100%" }}>
            <thead>
              <tr style={{ background: "var(--navy)", position: "sticky", top: 0 }}>
                {cols.map((col) => (
                  <th key={col} style={{
                    padding: "6px 10px",
                    color: "white",
                    fontWeight: 600,
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    whiteSpace: "nowrap",
                    textAlign: "left",
                    borderRight: "1px solid #ffffff22",
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {msg.rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "white" : "var(--accent-soft)" }}>
                  {cols.map((col) => (
                    <td key={col} style={{
                      padding: "5px 10px",
                      color: "var(--navy)",
                      borderRight: "1px solid var(--border)",
                      borderBottom: "1px solid var(--border)",
                      whiteSpace: "nowrap",
                    }}>
                      {row[col] !== null && row[col] !== undefined ? String(row[col]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
          {msg.rows.length} row{msg.rows.length !== 1 ? "s" : ""}
        </div>
      </div>
    );
  }

  if (msg.type === "module") {
    return (
      <div className="message assistant">
        <span style={{
          fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em",
          textTransform: "uppercase", background: "var(--accent-soft)",
          color: "var(--accent)", padding: "2px 8px", borderRadius: "4px",
        }}>
          {msg.text}
        </span>
      </div>
    );
  }

  if (msg.type === "blocked") {
    return (
      <div className="message blocked">
        <div className="message-bubble">{msg.text}</div>
      </div>
    );
  }

  if (msg.type === "error") {
    return (
      <div className="message assistant">
        <div className="message-bubble" style={{
          color: "var(--error)", background: "#fff3f3", border: "1px solid #ffd5d5"
        }}>
          ⚠ {msg.text}
        </div>
      </div>
    );
  }

  return (
    <div className={`message ${msg.role}`}>
      <div className="message-bubble" style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
    </div>
  );
}