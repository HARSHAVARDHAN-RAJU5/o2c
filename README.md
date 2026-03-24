# O2C Graph Intelligence System

> **Turn fragmented SAP business data into an interactive knowledge graph you can talk to.**

Most enterprise data lives in isolation — orders here, invoices there, payments somewhere else. This system stitches all of it together into a live, explorable graph and lets you query the entire Order-to-Cash pipeline in plain English. Ask "which customers have broken flows?" and watch the answer light up on the graph in real time.

---

## Live Demo

**[https://o2c.onrender.com/]**

> Replace with your actual deployed URL before submission.

---

## What It Does

- **Ingests** a SAP Order-to-Cash dataset (19 tables, ~8 entity types) into PostgreSQL
- **Builds** a pre-computed knowledge graph (nodes + edges) from relational joins
- **Renders** the graph interactively — expand any node, inspect its DB record, trace its connections
- **Answers** natural language questions by generating SQL on-the-fly, executing it, and streaming back a human-readable response
- **Highlights** the relevant graph nodes in yellow, or flags broken flows in red
- **Guards** against off-topic queries using an LLM-based classifier

---

## Screenshots

| Graph View | Chat Interface |
|---|---|
| *(Interactive node expansion, color-coded entity types, minimap)* | *(NL → SQL → streamed answer, node highlights)* |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser (React)                   │
│  ┌──────────────────┐    ┌────────────────────────┐ │
│  │   GraphView.jsx  │    │    ChatPanel.jsx        │ │
│  │  ReactFlow graph │◄──►│  WebSocket chat UI     │ │
│  └──────────────────┘    └────────────────────────┘ │
└───────────────────────────┬─────────────────────────┘
                            │ HTTP + WebSocket
┌───────────────────────────▼─────────────────────────┐
│              Node.js / Express Backend               │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │  graph.js   │ │   node.js    │ │   chat.js    │  │
│  │  /api/graph │ │  /api/node/  │ │  /ws/chat    │  │
│  └──────┬──────┘ └──────┬───────┘ └──────┬───────┘  │
└─────────┼───────────────┼────────────────┼──────────┘
          │               │                │
          ▼               ▼                ▼
   graph_nodes.json  PostgreSQL DB     Groq LLM API
   graph_edges.json  (19 tables)    (llama-3.3-70b)
```

### Why This Stack?

**PostgreSQL over Neo4j or SQLite**
The dataset is fundamentally relational — billing items join to sales order items via foreign keys, which SQL handles natively. The LLM-to-SQL path is well-understood and debuggable (generated queries are shown in the UI). Free-tier hosting on Render/Railway has excellent PostgreSQL support, whereas Neo4j's free tier is memory-constrained.

**Pre-computed JSON Graph**
The graph (`graph_nodes.json`, `graph_edges.json`) is generated once by `ingest.py` and loaded into memory at startup. This means graph traversal (tracing flows, finding broken orders) is instant — no graph DB round-trips needed at the scale of this dataset.

**Groq (llama-3.3-70b)**
Chosen for its free tier with generous rate limits and the fastest inference of any free provider (~200 tokens/sec). The llama-3.3-70b model has strong SQL generation capability and follows schema-injection prompts reliably.

**WebSockets over REST for Chat**
Streaming token-by-token responses require a persistent connection. WebSockets also allow the server to push multiple message types (status updates, SQL previews, table data, node highlights) without the client polling.

---

## Database Schema

19 tables covering the full O2C lifecycle:

| Layer | Tables |
|---|---|
| Master Data | `customers`, `business_partner_addresses`, `products`, `product_descriptions`, `product_plants`, `plants` |
| Sales | `sales_order_headers`, `sales_order_items`, `sales_order_schedule_lines` |
| Delivery | `outbound_delivery_headers`, `outbound_delivery_items` |
| Billing | `billing_document_headers`, `billing_document_items`, `billing_document_cancellations` |
| Finance | `journal_entries`, `payments` |
| Assignments | `customer_company_assignments`, `customer_sales_area_assignments`, `product_storage_locations` |

### Key Join Path

```sql
-- Full O2C chain
customers.customer
  → sales_order_headers.sold_to_party
  → sales_order_items.sales_order
  → outbound_delivery_items.reference_sd_document + reference_sd_doc_item
  → billing_document_items.reference_sd_document + reference_sd_doc_item
  → billing_document_headers.accounting_document
  → journal_entries.accounting_document
  → payments.invoice_reference
```

---

## Graph Model

### Nodes (8 entity types)

| Entity | Node ID Pattern | Color |
|---|---|---|
| Customer | `customer_{businessPartner}` | Dark Navy |
| SalesOrder | `so_{salesOrder}` | Navy Mid |
| SalesOrderItem | `soi_{salesOrder}_{item}` | Navy Light |
| Product | `product_{product}` | Accent Blue |
| Delivery | `delivery_{deliveryDocument}` | Light Blue |
| BillingDoc | `billing_{billingDocument}` | Lighter Blue |
| JournalEntry | `journal_{accountingDoc}_{item}` | Pale Blue |
| Payment | `payment_{accountingDoc}_{item}` | Very Pale Blue |

### Edges (relationship types)

| Source → Target | Label |
|---|---|
| Customer → SalesOrder | `PLACED` |
| SalesOrder → SalesOrderItem | `HAS_ITEM` |
| SalesOrderItem → Product | `FOR_PRODUCT` |
| Delivery → SalesOrderItem | `DELIVERS` |
| BillingDoc → Delivery | `BILLED_FROM` |
| JournalEntry → BillingDoc | `RECORDS` |
| Payment → Customer | `PAID_BY` |

> **Data quality fix:** Sales order item IDs are normalised (leading zeros stripped: `"000010"` → `"10"`) so that node IDs built from `sales_order_items` always match edge targets built from `outbound_delivery_items`. Dangling edges (referencing non-existent nodes) are dropped during ingest.

---

## LLM Prompting Strategy

### Two-Stage Pipeline

**Stage 1 — Guardrail** (`isAllowed`):
A lightweight single LLM call classifies the user message before any DB work happens.

```
ALLOWED | [Module]   →  proceed to intent routing
BLOCKED             →  return "This system only answers O2C questions"
```

The prompt is deliberately inclusive — any business analytics question is allowed. Only general knowledge, creative writing, and coding help are blocked.

**Stage 2 — Intent Routing** (before SQL generation):

```
message → detectIntent()
  ├── isBroken  →  findBrokenOrders()      [in-memory graph scan]
  ├── isTrace   →  traceGraph(id, depth=4) [depth-limited DFS]
  └── default   →  generateSQL() → db.query() → streamAnswer()
```

### SQL Generation

The system prompt for SQL generation includes:
- Full schema with column names and data types (loaded dynamically at startup)
- 2 sample rows per table so the LLM understands actual data formats
- Explicit JOIN HINTS enumerating all foreign-key relationships
- Auto-retry up to 2 times on SQL error, with the error message fed back

```javascript
// On failure, the next call includes:
{ role: "user", content: `That query failed: "${error}". Fix it using ONLY exact column names...` }
```

### Answer Generation

- Streamed via Groq's streaming API for responsive UX
- Last 10 turns of conversation history included for memory
- LLM instructed to summarise in 2–3 sentences (table is already shown above)
- Monetary amounts always formatted in ₹ INR with Indian comma notation

### Broken Flow Detection

Rather than a SQL query, broken orders are detected by walking the in-memory graph 2 levels deep from each SalesOrder node:

```
SalesOrder → [depth 1 neighbors] → [depth 2 neighbors]
```

If no `Delivery` or `BillingDoc` node is reachable within 2 hops, the order is flagged with a descriptive issue label.

### Graph Trace

Depth-limited DFS (default depth 4) from any starting node, skipping Customer nodes on the way back to prevent traversing the entire customer subgraph from a Payment node.

---

## Guardrails

The system blocks:
- General knowledge questions ("What is the capital of France?")
- Creative writing requests
- Coding help
- Any topic not related to O2C business data

Implementation uses the LLM itself (fast, flexible) rather than a keyword list (brittle).

**Example blocked response:**
> "This system only answers questions about the SAP Order-to-Cash dataset. Please ask about orders, deliveries, billing, payments, customers, or products."

---

## Features Implemented

| Feature | Status | Notes |
|---|---|---|
| Natural language → SQL | ✅ | Dynamic schema injection + auto-retry |
| Streaming responses | ✅ | Groq streaming API, chunk-by-chunk WebSocket |
| Conversation memory | ✅ | Last 10 turns per session |
| Graph node highlighting | ✅ | Query results → yellow; broken flows → red |
| Broken flow detection | ✅ | In-memory graph scan, 2-level DFS |
| Graph trace | ✅ | Depth-limited DFS from any node |
| Node click → chat suggestion | ✅ | Context-aware query suggestions |
| SQL query visibility | ✅ | Collapsible block in chat |
| Graph legend | ✅ | Collapsible, color-coded |
| Guardrails | ✅ | LLM-based classifier |
| Expandable graph nodes | ✅ | Click to reveal neighbors, +N badge |
| Node detail popup | ✅ | Full DB record on click |

---

## Example Queries

```
Which products are associated with the highest number of billing documents?
Trace the full flow for sales order 740506
Show me all sales orders with missing deliveries
What is the total revenue by customer?
Which customers have the most cancelled billing documents?
Show me deliveries that haven't been billed yet
What is the average order value per sales organization?
Find all payments received in the last quarter
```

---

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- PostgreSQL 14+

### Backend

```bash
# Install Node dependencies
cd backend && npm install

# Install Python dependencies
pip install psycopg2-binary python-dotenv

# Create .env file
cp .env.example .env
# Fill in: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, GROQ_API_KEY

# Run ingest (one-time — creates tables, loads data, builds graph JSON)
python3 ingest.py

# Start server
node server.js
```

### Frontend

```bash
cd frontend && npm install

# Create .env file
echo "VITE_API_URL=http://localhost:3001" > .env
echo "VITE_WS_URL=ws://localhost:3001/ws/chat" >> .env

npm run dev
```

### Build (Production)

```bash
# From repo root
npm run build   # builds frontend + installs backend deps + runs ingest
npm start       # starts Node server serving the built frontend
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `sap_o2c` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | *(required)* |
| `DB_SSL` | Set to `true` for cloud DBs | `false` |
| `GROQ_API_KEY` | Groq API key — free at [console.groq.com](https://console.groq.com) | *(required)* |
| `PORT` | Server port | `3001` |
| `VITE_API_URL` | Frontend → backend HTTP URL | *(required for build)* |
| `VITE_WS_URL` | Frontend → backend WebSocket URL | *(required for build)* |

---

## Project Structure

```
├── backend/
│   ├── server.js              # Express + WebSocket server
│   ├── db.js                  # PostgreSQL pool
│   ├── ingest.py              # One-time data ingest + graph builder
│   ├── graph_nodes.json       # Pre-computed graph nodes (generated)
│   ├── graph_edges.json       # Pre-computed graph edges (generated)
│   └── routes/
│       ├── chat.js            # LLM chat handler (guardrail + SQL + streaming)
│       ├── graph.js           # Graph JSON endpoint
│       └── node.js            # Node detail, trace, broken-order detection
├── frontend/
│   └── src/
│       ├── App.jsx            # Root layout
│       ├── index.css          # Design system (CSS variables)
│       └── components/
│           ├── GraphView.jsx  # ReactFlow graph with custom nodes
│           └── ChatPanel.jsx  # WebSocket chat UI
└── package.json               # Root build + start scripts
```

---

## Technical Decisions & Tradeoffs

**Why not stream graph queries through the LLM too?**
Broken flow detection and graph tracing are deterministic operations that don't benefit from LLM inference. Running them in-memory against the pre-computed graph is orders of magnitude faster and more reliable than asking an LLM to traverse a graph.

**Why cap history at 10 turns?**
Groq's context window is generous but token cost grows linearly with history. 10 turns covers ~5 back-and-forth exchanges — enough for coherent follow-up questions without hitting rate limits.

**Why `onlyRenderVisibleElements` in ReactFlow?**
The full graph can have thousands of nodes. Rendering only visible elements keeps the UI responsive even when "Expand All" is triggered.

**Why WebSocket over SSE for streaming?**
Server-Sent Events only support server→client messages. WebSocket supports bidirectional communication, which is needed to send conversation history with each message and receive multi-type responses (status, SQL, table, highlight, chunk, done) in a single connection.

---

## License

MIT