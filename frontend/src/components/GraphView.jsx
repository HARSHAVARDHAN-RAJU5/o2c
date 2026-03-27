import { useEffect, useState, useCallback, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";

const API = import.meta.env.VITE_API_URL || "";

const NODE_COLORS = {
  Customer:       "#0f1f3d",
  SalesOrder:     "#1a3460",
  SalesOrderItem: "#2a4a8a",
  Product:        "#3b6fd4",
  Delivery:       "#5b8fe8",
  BillingDoc:     "#7baee8",
  JournalEntry:   "#a0c4f0",
  Payment:        "#c8ddf8",
};

const NODE_SIZES = {
  Customer:       14,
  SalesOrder:     10,
  SalesOrderItem: 8,
  Product:        8,
  Delivery:       8,
  BillingDoc:     8,
  JournalEntry:   7,
  Payment:        7,
};

const ENTITY_TO_TABLE = {
  Customer:       "customers",
  SalesOrder:     "sales_order_headers",
  SalesOrderItem: "sales_order_items",
  Product:        "products",
  Delivery:       "outbound_delivery_headers",
  BillingDoc:     "billing_document_headers",
  JournalEntry:   "journal_entries",
  Payment:        "payments",
};

const ENTITY_ID_FIELD = {
  Customer:       "businessPartner",
  SalesOrder:     "salesOrder",
  SalesOrderItem: "salesOrder",
  Product:        "product",
  Delivery:       "deliveryDocument",
  BillingDoc:     "billingDocument",
  JournalEntry:   "accountingDocument",
  Payment:        "accountingDocument",
};

const TYPE_ZONES = {
  Customer:       { r: 0    },
  SalesOrder:     { r: 600  },
  SalesOrderItem: { r: 1100 },
  Product:        { r: 1500 },
  Delivery:       { r: 1200 },
  BillingDoc:     { r: 1700 },
  JournalEntry:   { r: 2000 },
  Payment:        { r: 2300 },
};

function deterministicJitter(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ((hash % 1000) / 1000 - 0.5) * 60;
}

// ─── CUSTOM CIRCLE NODE ───────────────────────────────────
function CircleNode({ data }) {
  const [hovered, setHovered] = useState(false);
  const color = NODE_COLORS[data.entity] || "#6b7a99";
  const size  = NODE_SIZES[data.entity]  || 8;

  const isCustomer    = data.entity === "Customer";
  const isHighlighted = data.highlighted;
  const isConnected   = data.connected;
  const isSelected    = data.selectedNode;
  const isBroken      = data.broken;
  const hiddenCount   = data.hiddenNeighborCount || 0;
  const isExpandable  = hiddenCount > 0;

  const showLabel = isCustomer || hovered || isSelected || isHighlighted || isBroken || isExpandable;

  let bg = color;
  if (isBroken && !isSelected && !isConnected)  bg = "#ef4444";
  else if (isSelected || isConnected)           bg = "#22c55e";
  else if (isHighlighted)                       bg = "#f59e0b";

  const dotSize = isSelected    ? size + 5
                : isConnected   ? size + 3
                : isBroken      ? size + 2
                : isHighlighted ? size + 3
                : size;

  let boxShadow = "none";
  if (isSelected)         boxShadow = `0 0 0 3px #22c55e66, 0 0 14px #22c55e33`;
  else if (isConnected)   boxShadow = `0 0 0 2px #22c55e66, 0 0 8px #22c55e22`;
  else if (isBroken)      boxShadow = `0 0 0 2px #ef444466, 0 0 8px #ef444422`;
  else if (isHighlighted) boxShadow = `0 0 0 3px #f59e0b99, 0 0 10px #f59e0b55`;
  else if (hovered)       boxShadow = `0 0 0 2px ${color}55`;
  else if (isCustomer)    boxShadow = `0 0 0 2px ${color}33`;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, width: 0, height: 0, border: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 0, height: 0, border: "none" }} />

      <div style={{
        width: dotSize, height: dotSize, borderRadius: "50%",
        background: bg, boxShadow, transition: "all 0.2s ease",
        cursor: "pointer", flexShrink: 0, position: "relative",
      }}>
        {/* +N badge for expandable nodes */}
        {isExpandable && (
          <div style={{
            position: "absolute", top: -6, right: -6,
            width: 14, height: 14, borderRadius: "50%",
            background: "var(--accent)", color: "white",
            fontSize: "8px", fontWeight: 700,
            fontFamily: "DM Sans, sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1.5px solid white",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          }}>
            {hiddenCount > 9 ? "9+" : `+${hiddenCount}`}
          </div>
        )}
      </div>

      {showLabel && (
        <div style={{
          position: "absolute", bottom: `calc(100% + 5px)`, left: "50%",
          transform: "translateX(-50%)",
          background: isSelected    ? "#f0fff4"
                    : isHighlighted ? "#fefce8"
                    : "white",
          color: "#0f1f3d",
          fontSize: isCustomer ? "11px" : "10px",
          fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
          padding: "3px 8px", borderRadius: "4px", whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(15,31,61,0.12)",
          border: isSelected    ? "1px solid #22c55e"
                : isHighlighted ? "1px solid #f59e0b"
                :                 "1px solid #dde3f0",
          pointerEvents: "none", zIndex: 999,
        }}>
          {data.label}
          {isExpandable && (
            <span style={{ color: "var(--accent)", marginLeft: 4, fontSize: "9px" }}>
              +{hiddenCount} hidden
            </span>
          )}
          {isBroken && data.brokenReason && (
            <div style={{ fontSize: "9px", color: "#ef4444", marginTop: "2px" }}>
              {data.brokenReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { circle: CircleNode };

function makeRfEdge(rawEdge) {
  return {
    id: rawEdge.id,
    source: rawEdge.source,
    target: rawEdge.target,
    type: "straight",
    style: { stroke: "#c8d4ec", strokeWidth: 0.6, opacity: 0.5 },
  };
}

// ─── LEGEND ──────────────────────────────────────────────
function GraphLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      position: "absolute", bottom: 14, right: 14, zIndex: 10,
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "8px", boxShadow: "0 2px 8px rgba(15,31,61,0.08)", overflow: "hidden",
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: "none", border: "none", padding: "7px 12px",
        fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
        cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
        fontFamily: "DM Sans, sans-serif",
      }}>
        <span>Legend</span>
        <span style={{ fontSize: "9px" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "8px 12px 10px", display: "flex", flexDirection: "column", gap: "5px" }}>
          {Object.entries(NODE_COLORS).map(([entity, color]) => (
            <div key={entity} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: NODE_SIZES[entity] || 8, height: NODE_SIZES[entity] || 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontSize: "11px", color: "var(--navy)" }}>{entity}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: "4px", paddingTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {[
              { color: "#f59e0b", label: "Highlighted by query" },
              { color: "#22c55e", label: "Selected / connected" },
              { color: "#ef4444", label: "Broken flow" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{label}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: 2 }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                background: "var(--accent)", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: "7px", color: "white", fontWeight: 700, flexShrink: 0,
              }}>+3</div>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Click to expand hidden neighbors</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN EXPORT ─────────────────────────────────────────
export default function GraphView(props) {
  return (
    <ReactFlowProvider>
      <GraphViewInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphViewInner({ onNodeSelect, highlightedIds = [], highlightType = "highlight" }) {
  const { getZoom, setViewport, getViewport, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Master data refs — never mutated after load
  const allNodesRef   = useRef([]);
  const allEdgesRef   = useRef([]);
  const nodeMapRef    = useRef({});
  const adjacencyRef  = useRef({});
  const positionCache = useRef({});
  const visibleIdsRef = useRef(new Set());
  const highlightedSetRef = useRef(new Set());

  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState(null);
  const [popup, setPopup]               = useState(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [connectedNodeIds, setConnectedNodeIds] = useState(new Set());
  const [selectedNodeId, setSelectedNodeId]     = useState(null);
  const [visibleCount, setVisibleCount] = useState(0);

  const wrapperRef = useRef(null);
  const PINCH_SPEED = 0.008;
  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 1.5;

  // ─── WHEEL ─────────────────────────────────────────────
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault(); e.stopPropagation();
      const currentZoom = getZoom();
      const viewport    = getViewport();
      const rect        = el.getBoundingClientRect();
      if (e.ctrlKey) {
        const delta   = -e.deltaY * PINCH_SPEED;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * (1 + delta)));
        const mouseX  = e.clientX - rect.left;
        const mouseY  = e.clientY - rect.top;
        setViewport({
          x: mouseX - (mouseX - viewport.x) * (newZoom / currentZoom),
          y: mouseY - (mouseY - viewport.y) * (newZoom / currentZoom),
          zoom: newZoom,
        }, { duration: 0 });
      } else {
        setViewport({ x: viewport.x - e.deltaX, y: viewport.y - e.deltaY, zoom: currentZoom }, { duration: 0 });
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [getZoom, getViewport, setViewport]);

  // ─── REBUILD CANVAS ────────────────────────────────────
  // Single function that re-derives the ReactFlow node/edge arrays
  // from the current visibleIds set + decoration state.
  const rebuildCanvas = useCallback((visibleIds, selId, connIds, hlSet, hlType) => {
    const nodeMap = nodeMapRef.current;
    const adj     = adjacencyRef.current;
    const pos     = positionCache.current;

    const rfNodes = [];
    visibleIds.forEach(id => {
      const raw = nodeMap[id];
      if (!raw) return;
      const neighbors       = adj[id] || [];
      const hiddenNeighbors = neighbors.filter(nid => !visibleIds.has(nid));
      rfNodes.push({
        id,
        type: "circle",
        position: pos[id] || { x: 0, y: 0 },
        data: {
          label: raw.data.label,
          ...raw.data,
          highlighted:         hlType === "highlight" && hlSet.has(id),
          broken:              hlType === "broken"    && hlSet.has(id),
          brokenReason:        hlType === "broken" && hlSet.has(id) ? raw.data.brokenReason : undefined,
          connected:           connIds.has(id),
          selectedNode:        id === selId,
          hiddenNeighborCount: hiddenNeighbors.length,
        },
      });
    });

    const rfEdges = allEdgesRef.current
      .filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map(makeRfEdge);

    setNodes(rfNodes);
    setEdges(rfEdges);
    setVisibleCount(visibleIds.size);
  }, [setNodes, setEdges]);

  // ─── LOAD GRAPH ────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/graph`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        allNodesRef.current = data.nodes;
        allEdgesRef.current = data.edges;

        const nodeMap = {};
        data.nodes.forEach(n => { nodeMap[n.id] = n; });
        nodeMapRef.current = nodeMap;

        const adj = {};
        data.edges.forEach(e => {
          if (!adj[e.source]) adj[e.source] = [];
          if (!adj[e.target]) adj[e.target] = [];
          adj[e.source].push(e.target);
          adj[e.target].push(e.source);
        });
        adjacencyRef.current = adj;

        // Pre-compute deterministic positions for all nodes
        const typeCounts  = {};
        const typeIndices = {};
        data.nodes.forEach(n => { typeCounts[n.data.entity] = (typeCounts[n.data.entity] || 0) + 1; });
        data.nodes.forEach(n => {
          const entity = n.data.entity;
          const zone   = TYPE_ZONES[entity] || { r: 800 };
          const total  = typeCounts[entity] || 1;
          if (!typeIndices[entity]) typeIndices[entity] = 0;
          const idx    = typeIndices[entity]++;
          const angle  = (idx / total) * 2 * Math.PI;
          const jitter = deterministicJitter(n.id);
          positionCache.current[n.id] = {
            x: entity === "Customer" ? Math.cos(angle) * 120 : Math.cos(angle) * (zone.r + jitter),
            y: entity === "Customer" ? Math.sin(angle) * 120 : Math.sin(angle) * (zone.r + jitter),
          };
        });

        // Start with Customer nodes only
        const initial = new Set(data.nodes.filter(n => n.data.entity === "Customer").map(n => n.id));
        visibleIdsRef.current = initial;
        rebuildCanvas(initial, null, new Set(), new Set(), "highlight");
        setLoading(false);
      })
      .catch(err => { setLoadError(err.message); setLoading(false); });
  }, [rebuildCanvas]);

  // ─── SYNC HIGHLIGHTS FROM CHAT ────────────────────────
  useEffect(() => {
    if (allNodesRef.current.length === 0) return;
    const hlSet = new Set(highlightedIds);
    highlightedSetRef.current = hlSet;

    // Auto-reveal highlighted nodes that aren't currently visible
    if (hlSet.size > 0) {
      const newVisible = new Set(visibleIdsRef.current);
      hlSet.forEach(id => { if (nodeMapRef.current[id]) newVisible.add(id); });
      visibleIdsRef.current = newVisible;
    }

    rebuildCanvas(visibleIdsRef.current, selectedNodeId, connectedNodeIds, hlSet, highlightType);
  }, [highlightedIds, highlightType, selectedNodeId, connectedNodeIds, rebuildCanvas]);

  // ─── NODE CLICK: expand neighbors ─────────────────────
  const onNodeClick = useCallback(async (event, node) => {
    const nodeId    = node.id;
    const adj       = adjacencyRef.current;
    const nodeMap   = nodeMapRef.current;

    // Expand: reveal all direct neighbors
    const neighbors  = adj[nodeId] || [];
    const newVisible = new Set(visibleIdsRef.current);
    neighbors.forEach(nid => { if (nodeMap[nid]) newVisible.add(nid); });
    visibleIdsRef.current = newVisible;

    const connIds = new Set(neighbors.filter(nid => nodeMap[nid]));
    setConnectedNodeIds(connIds);
    setSelectedNodeId(nodeId);
    highlightedSetRef.current = new Set(); 

    rebuildCanvas(newVisible, nodeId, connIds, highlightedSetRef.current, highlightType);
    onNodeSelect && onNodeSelect(node);

    // Fetch DB record for popup
    const table   = ENTITY_TO_TABLE[node.data.entity];
    const idField = ENTITY_ID_FIELD[node.data.entity];
    const id      = node.data[idField];

    setPopup({ node, record: null, connectedEdges: [] });
    setPopupLoading(true);

    if (table && id) {
      try {
        const res  = await fetch(`${API}/api/node/${table}/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setPopup({ node, record: data.record?.[0] || null, connectedEdges: data.connectedEdges || [] });
      } catch (err) {
        console.error("Node fetch failed:", err);
        setPopup({ node, record: null, connectedEdges: [] });
      }
    }
    setPopupLoading(false);
  }, [onNodeSelect, highlightType, rebuildCanvas]);

  const onPaneClick = useCallback(() => {
    setPopup(null);
    setConnectedNodeIds(new Set());
    setSelectedNodeId(null);
    onNodeSelect && onNodeSelect(null);
    rebuildCanvas(visibleIdsRef.current, null, new Set(), highlightedSetRef.current, highlightType);
  }, [onNodeSelect, highlightType, rebuildCanvas]);

  const handleReset = useCallback(() => {
    const initial = new Set(allNodesRef.current.filter(n => n.data.entity === "Customer").map(n => n.id));
    visibleIdsRef.current = initial;
    highlightedSetRef.current = new Set();
    setPopup(null);
    setConnectedNodeIds(new Set());
    setSelectedNodeId(null);
    rebuildCanvas(initial, null, new Set(), new Set(), "highlight");
    setTimeout(() => fitView({ padding: 0.08, duration: 400 }), 50);
  }, [fitView, rebuildCanvas]);

  const handleExpandAll = useCallback(() => {
    const allIds = new Set(allNodesRef.current.map(n => n.id));
    visibleIdsRef.current = allIds;
    rebuildCanvas(allIds, selectedNodeId, connectedNodeIds, highlightedSetRef.current, highlightType);
  }, [selectedNodeId, connectedNodeIds, highlightType, rebuildCanvas]);

  const totalCount = allNodesRef.current.length;

  return (
    <div className="graph-wrapper" ref={wrapperRef}>
      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "var(--text-muted)", fontSize: "13px",
          zIndex: 10, background: "var(--bg)",
        }}>
          Building graph...
        </div>
      )}

      {loadError && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          color: "var(--error)", fontSize: "13px", gap: "8px",
          zIndex: 10, background: "var(--bg)",
        }}>
          <div>⚠ Failed to load graph: {loadError}</div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Make sure the backend is running and ingest.py has been executed.
          </div>
        </div>
      )}

      {/* Controls bar */}
      {!loading && (
        <div style={{
          position: "absolute", top: 14, left: 14, zIndex: 10,
          display: "flex", gap: "8px", alignItems: "center",
        }}>
          <button className="graph-btn" onClick={handleReset} title="Collapse back to customers only">
            ↺ Reset
          </button>
          <button className="graph-btn" onClick={handleExpandAll} title="Show all nodes at once">
            ⊞ Expand All
          </button>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "5px", padding: "4px 10px",
            fontSize: "11px", color: "var(--text-muted)",
          }}>
            <span style={{ color: "var(--navy)", fontWeight: 600 }}>{visibleCount}</span>
            {" / "}
            {totalCount} nodes visible
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick} onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.2 }}
        minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}
        nodesDraggable={false} selectNodesOnDrag={false}
        onlyRenderVisibleElements={true}
        panOnScroll={false} zoomOnScroll={false}
        zoomOnPinch={false} zoomOnDoubleClick={false}
        panOnDrag={true} preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e4e9f5" gap={28} size={0.8} />
        <Controls />
        <MiniMap
          nodeComponent={({ x, y, data }) => (
            <circle cx={x} cy={y} r={4} fill={
              data?.selectedNode ? "#22c55e" :
              data?.broken       ? "#ef4444" :
              data?.highlighted  ? "#f59e0b" :
              NODE_COLORS[data?.entity] || "#6b7a99"
            } />
          )}
          maskColor="rgba(245,247,251,0.6)" zoomable pannable
          style={{ border: "1px solid var(--border)", borderRadius: "8px", width: 180, height: 130 }}
        />
      </ReactFlow>

      <GraphLegend />

      {popup && (
        <NodePopup
          popup={popup} loading={popupLoading}
          onClose={() => {
            setPopup(null);
            setConnectedNodeIds(new Set());
            setSelectedNodeId(null);
            onNodeSelect && onNodeSelect(null);
            rebuildCanvas(visibleIdsRef.current, null, new Set(), highlightedSetRef.current, highlightType);
          }}
        />
      )}
    </div>
  );
}

// ─── NODE POPUP ───────────────────────────────────────────
function NodePopup({ popup, loading, onClose }) {
  const { node, record, connectedEdges } = popup;
  const color = NODE_COLORS[node.data.entity] || "#6b7a99";

  return (
    <div className="node-popup">
      <div className="popup-header">
        <span className="popup-title">{node.data.label}</span>
        <button className="popup-close" onClick={onClose}>✕</button>
      </div>
      <span className="popup-badge" style={{ background: color + "22", color }}>
        {node.data.entity}
      </span>
      {loading ? (
        <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px 0" }}>Loading...</div>
      ) : record ? (
        <div className="popup-fields" style={{
          maxHeight: "320px", overflowY: "scroll", paddingRight: "6px",
          scrollbarWidth: "thin", scrollbarColor: "#c8d4ec #f5f7fb",
        }}>
          {Object.entries(record)
            .filter(([, v]) => v !== null && v !== "")
            .map(([k, v]) => (
              <div className="popup-field" key={k}>
                <span className="popup-field-key">{k.replace(/_/g, " ")}</span>
                <span className="popup-field-value">{String(v)}</span>
              </div>
            ))}
        </div>
      ) : (
        <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px 0" }}>No record found.</div>
      )}
      <div className="popup-connections" style={{ marginTop: "10px" }}>
        {(connectedEdges || []).length} connection{(connectedEdges || []).length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}