import { useState } from "react";
import GraphView from "./components/GraphView";
import ChatPanel from "./components/ChatPanel";

export default function App() {
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedIds, setHighlightedIds] = useState([]);
  const [highlightType, setHighlightType] = useState("highlight");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <span className="header-logo">O2C</span>
          <div className="header-title">
            <span className="header-breadcrumb">Mapping</span>
            <span className="header-separator">/</span>
            <span className="header-page">Order to Cash</span>
          </div>
        </div>
        <div className="header-right">
          <span className="header-status">
            <span className="status-dot" />
            Live
          </span>
        </div>
      </header>

      <div className="app-body">
        <div className="graph-panel">
        <GraphView
            selectedNode={selectedNode}
            onNodeSelect={setSelectedNode}
            highlightedIds={highlightedIds}
            highlightType={highlightType}
          />
        </div>

        <div className="panel-divider" />

        <div className="chat-panel">
          <ChatPanel
            selectedNode={selectedNode}
            onHighlight={(ids, type = "highlight") => {
            setHighlightedIds(ids);
            setHighlightType(type);
          }}
        />
        </div>
      </div>
    </div>
  );
}