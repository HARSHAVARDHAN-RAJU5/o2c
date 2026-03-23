const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const NODES_PATH = path.join(__dirname, "../graph_nodes.json");
const EDGES_PATH = path.join(__dirname, "../graph_edges.json");

// FIX: Load graph JSON once at startup instead of on every request.
// fs.readFileSync inside a route handler blocks the Node.js event loop
// on every single API call — catastrophic for a large graph.
let graphCache = null;

function loadGraph() {
  try {
    const nodes = JSON.parse(fs.readFileSync(NODES_PATH, "utf-8"));
    const edges = JSON.parse(fs.readFileSync(EDGES_PATH, "utf-8"));
    graphCache = { nodes, edges };
    console.log(`Graph loaded: ${nodes.length} nodes, ${edges.length} edges`);
  } catch (err) {
    console.error("Failed to load graph files:", err.message);
    graphCache = null;
  }
}

// Load immediately on module import
loadGraph();

// GET /api/graph
router.get("/", (req, res) => {
  if (!graphCache) {
    return res.status(503).json({ error: "Graph data not available. Run ingest.py first." });
  }
  res.json(graphCache);
});

// POST /api/graph/reload  — call this if you re-run ingest without restarting the server
router.post("/reload", (req, res) => {
  loadGraph();
  if (graphCache) {
    res.json({ message: "Graph reloaded", nodes: graphCache.nodes.length, edges: graphCache.edges.length });
  } else {
    res.status(500).json({ error: "Reload failed — check graph JSON files exist" });
  }
});

module.exports = router;