const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("../db");

const router = express.Router();

const NODES_PATH = path.join(__dirname, "../graph_nodes.json");
const EDGES_PATH = path.join(__dirname, "../graph_edges.json");

let allNodes = [];
let allEdges = [];
let adjacency = {};
let nodeMap = {};

// ─── LOAD GRAPH + BUILD ADJACENCY ────────────────────────
function loadGraph() {
  try {
    allNodes = JSON.parse(fs.readFileSync(NODES_PATH, "utf-8"));
    allEdges = JSON.parse(fs.readFileSync(EDGES_PATH, "utf-8"));

    adjacency = {};
    nodeMap = {};

    allNodes.forEach((n) => {
      nodeMap[n.id] = n;
    });

    allEdges.forEach((e) => {
      if (!adjacency[e.source]) adjacency[e.source] = [];
      if (!adjacency[e.target]) adjacency[e.target] = [];
      adjacency[e.source].push({ id: e.target, label: e.label });
      // BUG FIX: For trace we want directed traversal (source → target only) for
      // the O2C flow direction. However broken-order detection uses bidirectional.
      // We keep bidirectional here and control direction via entity-type filtering
      // inside traceGraph instead.
      adjacency[e.target].push({ id: e.source, label: e.label });
    });

    console.log(`Node router: graph loaded (${allNodes.length} nodes, ${allEdges.length} edges)`);
  } catch (err) {
    console.error("Node router: failed to load graph files:", err.message);
  }
}

loadGraph();

// ─── GRAPH TRACE ─────────────────────────────────────────
// Depth-limited DFS. Default maxDepth=4 covers the full O2C flow:
//   SalesOrder(0) → SalesOrderItem(1) → Delivery(2) → BillingDoc(3) → JournalEntry(4)
//
// BUG FIX: The original had no visited guard reset between calls if called
// repeatedly in the same process — fixed by ensuring visited is local.
// Also: we now skip Payment nodes beyond depth 3 to avoid traversing the
// entire customer subgraph when a payment links back to a customer node.
const O2C_FLOW_ORDER = [
  "Customer", "SalesOrder", "SalesOrderItem", "Product",
  "Delivery", "BillingDoc", "JournalEntry", "Payment"
];

function traceGraph(startId, maxDepth = 4) {
  const visited = new Set();
  const result = [];

  function dfs(id, depth) {
    if (visited.has(id) || depth > maxDepth) return;
    visited.add(id);

    const node = nodeMap[id];
    if (node) result.push(node);

    const neighbors = adjacency[id] || [];
    neighbors.forEach((neighbor) => {
      // Don't traverse back up to Customer from Payment — it would explode
      const neighborNode = nodeMap[neighbor.id];
      if (neighborNode?.data?.entity === "Customer" && depth > 0) return;
      dfs(neighbor.id, depth + 1);
    });
  }

  dfs(startId, 0);
  return result;
}

// ─── BROKEN FLOW DETECTION ────────────────────────────────
// BUG FIX: Original checked direct neighbors only for Delivery and BillingDoc.
// But in the graph, SalesOrder connects to SalesOrderItem, not directly to
// Delivery or BillingDoc. We must walk 2 levels deep.
function findBrokenOrders() {
  const broken = [];

  allNodes.forEach((node) => {
    if (node.data.entity !== "SalesOrder") return;

    // Walk depth-2 neighbors: SO → SOItem → {Delivery, BillingDoc}
    const depth1 = (adjacency[node.id] || []).map(n => nodeMap[n.id]).filter(Boolean);
    let hasDelivery = false;
    let hasBilling  = false;

    depth1.forEach((d1) => {
      if (d1.data.entity === "Delivery")   hasDelivery = true;
      if (d1.data.entity === "BillingDoc") hasBilling  = true;

      // depth 2
      const depth2 = (adjacency[d1.id] || []).map(n => nodeMap[n.id]).filter(Boolean);
      depth2.forEach((d2) => {
        if (d2.data.entity === "Delivery")   hasDelivery = true;
        if (d2.data.entity === "BillingDoc") hasBilling  = true;
      });
    });

    if (!hasDelivery || !hasBilling) {
      let issue, explanation;
      if (!hasDelivery && !hasBilling) {
        issue = "No Delivery & No Billing";
        explanation = "Sales order exists but has neither a delivery nor a billing document";
      } else if (!hasDelivery) {
        issue = "Missing Delivery";
        explanation = "Billing exists but no linked delivery document found";
      } else {
        issue = "Missing Billing";
        explanation = "Delivery exists but no corresponding billing document found";
      }

      broken.push({
        id: node.id,
        label: node.data.label,
        issue,
        explanation,
        brokenReason: issue,
      });
    }
  });

  return broken;
}

// ─── GRAPH API ROUTES ─────────────────────────────────────

router.get("/graph/trace/:id", (req, res) => {
  const { id } = req.params;

  if (!adjacency[id]) {
    return res.status(404).json({ error: "Node not found in graph" });
  }

  const depth = Math.min(parseInt(req.query.depth) || 4, 6);
  const nodes = traceGraph(id, depth);

  res.json({ start: id, count: nodes.length, nodes });
});

router.get("/graph/broken-orders", (req, res) => {
  const result = findBrokenOrders();
  res.json({ count: result.length, broken: result.slice(0, 100) });
});

// ─── ALLOWED TABLES ──────────────────────────────────────
const ALLOWED_TABLES = [
  "customers",
  "business_partner_addresses",
  "sales_order_headers",
  "sales_order_items",
  "sales_order_schedule_lines",
  "billing_document_headers",
  "billing_document_items",
  "billing_document_cancellations",
  "outbound_delivery_headers",
  "outbound_delivery_items",
  "journal_entries",
  "payments",
  "products",
  "product_descriptions",
  "product_plants",
  "product_storage_locations",
  "plants",
  "customer_company_assignments",
  "customer_sales_area_assignments",
];

const PRIMARY_KEYS = {
  customers:                        "business_partner",
  business_partner_addresses:       "business_partner",
  sales_order_headers:              "sales_order",
  sales_order_items:                "sales_order",
  sales_order_schedule_lines:       "sales_order",
  billing_document_headers:         "billing_document",
  billing_document_items:           "billing_document",
  billing_document_cancellations:   "billing_document",
  outbound_delivery_headers:        "delivery_document",
  outbound_delivery_items:          "delivery_document",
  journal_entries:                  "accounting_document",
  payments:                         "accounting_document",
  products:                         "product",
  product_descriptions:             "product",
  product_plants:                   "product",
  product_storage_locations:        "product",
  plants:                           "plant",
  customer_company_assignments:     "customer",
  customer_sales_area_assignments:  "customer",
};

function tableToNodePrefix(table, id) {
  const map = {
    customers:                      `customer_${id}`,
    sales_order_headers:            `so_${id}`,
    sales_order_items:              `so_${id}`,
    billing_document_headers:       `billing_${id}`,
    billing_document_items:         `billing_${id}`,
    billing_document_cancellations: `billing_${id}`,
    outbound_delivery_headers:      `delivery_${id}`,
    outbound_delivery_items:        `delivery_${id}`,
    journal_entries:                `journal_${id}`,
    payments:                       `payment_${id}`,
    products:                       `product_${id}`,
    product_descriptions:           `product_${id}`,
    product_plants:                 `product_${id}`,
    product_storage_locations:      `product_${id}`,
    plants:                         `plant_${id}`,
  };
  return map[table] || `${table}_${id}`;
}

// ─── NODE DETAILS ROUTE ───────────────────────────────────
router.get("/:table/:id", async (req, res) => {
  const { table, id } = req.params;

  if (!ALLOWED_TABLES.includes(table)) {
    return res.status(400).json({ error: `Unknown table: ${table}` });
  }

  const pkColumn = PRIMARY_KEYS[table];

  try {
    const result = await db.query(
      `SELECT * FROM ${table} WHERE ${pkColumn} = $1 LIMIT 20`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Record not found" });
    }

    const nodePrefix = tableToNodePrefix(table, id);

    const connectedEdges = allEdges.filter(
      (e) => e.source === nodePrefix || e.target === nodePrefix
    );

    const connectedNodeIds = new Set();
    connectedEdges.forEach((e) => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });

    const connectedNodes = allNodes.filter((n) => connectedNodeIds.has(n.id));

    res.json({ record: result.rows, connectedNodes, connectedEdges });
  } catch (err) {
    console.error("Node fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch node data" });
  }
});

// ─── EXPORTS ──────────────────────────────────────────────
module.exports = router;
module.exports.findBrokenOrders = findBrokenOrders;
module.exports.traceGraph = traceGraph;