require("dotenv").config();

const db = require("../db");
const Groq = require("groq-sdk");

const { findBrokenOrders, traceGraph } = require("./node");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "llama-3.3-70b-versatile";

// ─── DYNAMIC SCHEMA LOADER ────────────────────────────────
let schemaContext = null;

async function loadSchema() {
  const colResult = await db.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);

  const tables = {};
  for (const row of colResult.rows) {
    if (!tables[row.table_name]) tables[row.table_name] = [];
    tables[row.table_name].push(`${row.column_name} (${row.data_type})`);
  }

  const tableNames = Object.keys(tables);
  const samples = {};
  for (const table of tableNames) {
    try {
      const s = await db.query(`SELECT * FROM ${table} LIMIT 2`);
      samples[table] = s.rows;
    } catch (e) {
      samples[table] = [];
    }
  }

  schemaContext = tableNames.map((table) => {
    const cols = tables[table].join(", ");
    const sampleRows = samples[table]
      .map((row) => "    " + JSON.stringify(row))
      .join("\n");
    return `TABLE ${table}:\n  COLUMNS: ${cols}\n  SAMPLE ROWS:\n${sampleRows || "    (none)"}`;
  }).join("\n\n");

  schemaContext += `

JOIN HINTS (derived from matching column values across tables):
- customers.customer = sales_order_headers.sold_to_party  (customer identifier)
- customers.customer = billing_document_headers.sold_to_party
- sales_order_headers.sales_order = sales_order_items.sales_order
- sales_order_items.sales_order = billing_document_items.reference_sd_document
- sales_order_items.sales_order_item = billing_document_items.reference_sd_doc_item
- billing_document_headers.billing_document = billing_document_items.billing_document
- outbound_delivery_headers.delivery_document = outbound_delivery_items.delivery_document
- sales_order_items.sales_order = outbound_delivery_items.reference_sd_document
- sales_order_items.sales_order_item = outbound_delivery_items.reference_sd_doc_item
- billing_document_headers.accounting_document = journal_entries.accounting_document
- billing_document_headers.accounting_document = payments.accounting_document
- payments.invoice_reference = billing_document_headers.billing_document
`;

  console.log("Schema loaded dynamically with sample rows and join hints");
}

loadSchema().catch((err) => console.error("Failed to load schema:", err.message));

// ─── GUARDRAIL ────────────────────────────────────────────
// BUG FIX: guardrail was too aggressive — "show me revenue by customer" was
// getting BLOCKED because it didn't mention a specific SAP entity. Now we use
// a broader prompt that allows any business analytics question over the dataset.
async function isAllowed(message) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are a guardrail for a SAP Order-to-Cash (O2C) data analytics system.
The system contains data about: Sales Orders, Deliveries, Billing Documents, Payments, Customers, Products, Journal Entries, and their relationships.

Decide if the user message is a business analytics or data question that could be answered using this dataset.
ALLOW questions about: orders, shipments, invoices, payments, customers, products, revenue, amounts, dates, statuses, counts, trends, comparisons, tracing document flows, finding anomalies, financial analysis, and any question that references entities or metrics from the dataset.
BLOCK only: general knowledge (history, science, etc.), creative writing, coding help, personal advice, or topics completely unrelated to business data.

If ALLOWED, reply exactly: "ALLOWED | [Module]" where Module is one of: Sales, Shipping, Billing, Payments, Customers, Products, Finance, Analytics.
If BLOCKED, reply exactly: "BLOCKED".
Reply with nothing else.`
      },
      { role: "user", content: message }
    ],
    max_tokens: 20,
  });

  const text = response.choices[0]?.message?.content?.trim().toUpperCase() || "BLOCKED";
  if (text.startsWith("ALLOWED")) {
    const parts = text.split("|");
    const module = parts[1] ? parts[1].trim() : null;
    return { allowed: true, module };
  }
  return { allowed: false, module: null };
}

// ─── SQL GENERATION ───────────────────────────────────────
async function generateSQL(message, history = [], previousError = null) {
  const systemPrompt = `You are an expert SQL assistant for a SAP Order-to-Cash PostgreSQL database.

CRITICAL RULES:
- Use ONLY the exact column names shown in the schema below
- Use the JOIN HINTS to join tables correctly — never guess join keys
- Always use COUNT(*) when user asks "how many"
- NEVER add WHERE clauses with hardcoded placeholder values like 'customer1'
- All amounts are in INR (Indian Rupees)
- Do not use INSERT, UPDATE, DELETE or DROP
- Return ONLY raw SQL, no explanation, no markdown, no backticks
- Always add LIMIT 100 unless the user asks for all records or aggregates
- When asked about "broken" or "incomplete" flows, use LEFT JOIN and IS NULL checks
- For revenue/amount queries, use SUM(total_net_amount) and GROUP BY appropriately
- CAST numeric columns to NUMERIC when needed for SUM/AVG

${schemaContext}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6),
    { role: "user", content: message }
  ];

  if (previousError) {
    messages.push({ role: "assistant", content: previousError.sql });
    messages.push({
      role: "user",
      content: `That query failed: "${previousError.error}". Fix it using ONLY exact column names from the schema and the join hints provided.`
    });
  }

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 600,
  });

  let sql = response.choices[0]?.message?.content?.trim() || "";
  sql = sql.replace(/```sql/gi, "").replace(/```/g, "").trim();
  return sql;
}

// ─── EXTRACT NODE IDS FROM QUERY RESULTS ─────────────────
const ID_FIELD_TO_PREFIX = {
  sales_order:         "so",
  billing_document:    "billing",
  delivery_document:   "delivery",
  accounting_document: "journal",
  business_partner:    "customer",
  customer:            "customer",
  product:             "product",
  material:            "product",
};

function extractNodeIds(rows) {
  const nodeIds = new Set();
  for (const row of rows) {
    for (const [col, value] of Object.entries(row)) {
      if (!value) continue;
      const prefix = ID_FIELD_TO_PREFIX[col];
      if (prefix) nodeIds.add(`${prefix}_${value}`);
    }
  }
  return Array.from(nodeIds);
}

// ─── NATURAL LANGUAGE ANSWER (streamed) ───────────────────
async function streamAnswer(message, sql, rows, history, ws) {
  const stream = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are a helpful business data analyst for an Indian company.
Answer clearly and concisely based only on the data provided.
Do not make up information not present in the results.
All monetary amounts are in INR (Indian Rupees), NOT USD. Always show amounts with the ₹ rupee symbol and format large numbers with commas (e.g. ₹1,23,456).
You have memory of the conversation — use prior context if the user refers to previous questions.
Keep answers to 2-3 sentences maximum. The data table is already shown above — just summarize the key insight or finding.`
      },
      ...history.slice(-6),
      {
        role: "user",
        content: `The user asked: "${message}"
SQL run: ${sql}
Results (${rows.length} rows): ${JSON.stringify(rows.slice(0, 30), null, 2)}
Summarize the key insight in 2-3 sentences. Do NOT list all rows — the table is shown above. If results are empty, say no matching data was found.`
      }
    ],
    max_tokens: 512,
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || "";
    if (text) ws.send(JSON.stringify({ type: "chunk", message: text }));
  }
}

// ─── INTENT DETECTION ─────────────────────────────────────
// Centralised intent checks — previously scattered regex caused mis-routing.
function detectIntent(message) {
  const lower = message.toLowerCase();
  const isBroken  = /broken|incomplete|missing.*deliver|missing.*bill|not.*billed|not.*delivered|no.*delivery|no.*invoice|issue|problem|anomal/i.test(lower);
  const isTrace   = /trace|full.flow|end.to.end|journey|path|connected|follow/i.test(lower);

  // Extract a document ID from the message for trace queries
  let traceId = null;
  if (isTrace) {
    // Try explicit prefixes first
    let m = message.match(/\b(so_\d+|billing_\d+|delivery_\d+)/i);
    if (m) {
      traceId = m[1].toLowerCase();
    } else {
      // Fallback: long numeric ID with context clue
      const numM = message.match(/\b(\d{6,})\b/);
      if (numM) {
        const id = numM[1];
        if (/billing|invoice|bill/i.test(lower))   traceId = `billing_${id}`;
        else if (/deliver/i.test(lower))            traceId = `delivery_${id}`;
        else                                        traceId = `so_${id}`;
      }
    }
  }

  return { isBroken, isTrace, traceId };
}

// ─── MAIN HANDLER ─────────────────────────────────────────
async function handleChat(message, history = [], ws) {
  if (!schemaContext) {
    ws.send(JSON.stringify({ type: "error", message: "Schema not ready yet, please try again in a moment." }));
    ws.send(JSON.stringify({ type: "done" }));
    return;
  }

  // ─── GUARDRAIL CHECK ──────────────────────────────────
  const { allowed, module } = await isAllowed(message);

  if (!allowed) {
    ws.send(JSON.stringify({
      type: "blocked",
      message: "This system only answers questions about the SAP Order-to-Cash dataset. Please ask about orders, deliveries, billing, payments, customers, or products."
    }));
    ws.send(JSON.stringify({ type: "done" }));
    return;
  }

  if (module) ws.send(JSON.stringify({ type: "module", message: module }));

  try {
    const { isBroken, isTrace, traceId } = detectIntent(message);

    // ─── BROKEN FLOW DETECTION ────────────────────────
    if (isBroken) {
      ws.send(JSON.stringify({ type: "status", message: "Scanning for broken flows..." }));
      const data = findBrokenOrders();

      if (data.length === 0) {
        ws.send(JSON.stringify({ type: "chunk", message: "No broken or incomplete flows were found in the dataset." }));
        ws.send(JSON.stringify({ type: "done" }));
        return;
      }

      const ids = data.map(x => x.id);
      ws.send(JSON.stringify({ type: "broken", ids }));
      ws.send(JSON.stringify({ type: "table", rows: data }));
      ws.send(JSON.stringify({ type: "chunk", message: `Found ${data.length} sales orders with incomplete flows. ${data.filter(d => d.issue === 'Missing Delivery').length} are missing a delivery and ${data.filter(d => d.issue === 'Missing Billing').length} are missing a billing document. They are highlighted in red on the graph.` }));
      ws.send(JSON.stringify({ type: "done" }));
      return;
    }

    // ─── GRAPH TRACE ──────────────────────────────────
    if (isTrace && traceId) {
      ws.send(JSON.stringify({ type: "status", message: "Tracing document flow..." }));
      const traced = traceGraph(traceId, 4);

      if (traced.length === 0) {
        ws.send(JSON.stringify({ type: "chunk", message: `Could not find node "${traceId}" in the graph. Please check the ID.` }));
        ws.send(JSON.stringify({ type: "done" }));
        return;
      }

      ws.send(JSON.stringify({ type: "highlight", ids: traced.map(n => n.id) }));
      ws.send(JSON.stringify({
        type: "table",
        rows: traced.map(n => ({
          id: n.id,
          type: n.data.entity,
          label: n.data.label,
        }))
      }));
      ws.send(JSON.stringify({
        type: "chunk",
        message: `Traced ${traced.length} connected nodes for "${traceId}". The full O2C flow is highlighted on the graph — including ${traced.filter(n => n.data?.entity === 'Delivery').length} delivery, ${traced.filter(n => n.data?.entity === 'BillingDoc').length} billing, and ${traced.filter(n => n.data?.entity === 'JournalEntry').length} journal entry nodes.`
      }));
      ws.send(JSON.stringify({ type: "done" }));
      return;
    }

    // ─── SQL PATH ─────────────────────────────────────
    ws.send(JSON.stringify({ type: "status", message: "Generating query..." }));
    let sql = await generateSQL(message, history);
    let rows = [];
    let attempts = 0;

    while (attempts <= 2) {
      ws.send(JSON.stringify({ type: "sql", message: sql }));
      try {
        ws.send(JSON.stringify({ type: "status", message: "Running query..." }));
        const result = await db.query(sql);
        rows = result.rows;
        break;
      } catch (sqlErr) {
        attempts++;
        if (attempts > 2) {
          ws.send(JSON.stringify({ type: "error", message: `Query failed after ${attempts} attempts: ${sqlErr.message}` }));
          ws.send(JSON.stringify({ type: "done" }));
          return;
        }
        ws.send(JSON.stringify({ type: "status", message: `Retrying query (attempt ${attempts + 1})...` }));
        sql = await generateSQL(message, history, { sql, error: sqlErr.message });
      }
    }

    // Highlight graph nodes matching query results
    const nodeIds = extractNodeIds(rows);
    if (nodeIds.length > 0) {
      ws.send(JSON.stringify({ type: "highlight", ids: nodeIds }));
    }

    // BUG FIX: was sending table even for single-value aggregates (COUNT(*), SUM).
    // Only show table if there are multiple columns OR multiple rows.
    const isAggregate = rows.length === 1 && Object.keys(rows[0] || {}).length === 1;
    if (rows.length > 0 && !isAggregate) {
      ws.send(JSON.stringify({ type: "table", rows: rows.slice(0, 50) }));
    }

    ws.send(JSON.stringify({ type: "status", message: "Preparing answer..." }));
    await streamAnswer(message, sql, rows, history, ws);
    ws.send(JSON.stringify({ type: "done" }));

  } catch (err) {
    console.error("Chat handler error:", err.message);
    ws.send(JSON.stringify({ type: "error", message: `Unexpected error: ${err.message}` }));
    ws.send(JSON.stringify({ type: "done" }));
  }
}

module.exports = { handleChat };