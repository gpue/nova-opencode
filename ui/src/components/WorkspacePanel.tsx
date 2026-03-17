import { useEffect, useMemo, useState } from "react";
import { getWorkspaceFile, getWorkspaceTree, saveWorkspaceFile } from "../lib/api";
import type { WorkspaceNode } from "../lib/types";

interface WorkspacePanelProps {
  open: boolean;
  onClose: () => void;
}

function TreeNode({ node, selectedPath, onSelect }: { node: WorkspaceNode; selectedPath: string | null; onSelect: (path: string) => void }) {
  const [expanded, setExpanded] = useState(node.type === "directory");

  if (node.type === "file") {
    return (
      <button className={`workspace-node workspace-file${selectedPath === node.path ? " selected" : ""}`} type="button" onClick={() => onSelect(node.path)}>
        <span className="workspace-node-label">{node.name}</span>
      </button>
    );
  }

  return (
    <div className="workspace-branch">
      <button className="workspace-node workspace-folder" type="button" onClick={() => setExpanded((current) => !current)}>
        <span>{expanded ? "▾" : "▸"}</span>
        <span className="workspace-node-label">{node.name}</span>
      </button>
      {expanded ? (
        <div className="workspace-children">
          {(node.children || []).map((child) => (
            <TreeNode key={child.path} node={child} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspacePanel({ open, onClose }: WorkspacePanelProps) {
  const [tree, setTree] = useState<WorkspaceNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    getWorkspaceTree()
      .then((data) => setTree(data.tree))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load workspace"));
  }, [open]);

  useEffect(() => {
    if (!selectedPath) return;
    setLoading(true);
    getWorkspaceFile(selectedPath)
      .then((file) => {
        setContent(file.content);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load file"))
      .finally(() => setLoading(false));
  }, [selectedPath]);

  const flatFiles = useMemo(() => {
    const files: WorkspaceNode[] = [];
    const walk = (nodes: WorkspaceNode[]) => {
      for (const node of nodes) {
        if (node.type === "file") files.push(node);
        if (node.children) walk(node.children);
      }
    };
    walk(tree);
    return files;
  }, [tree]);

  useEffect(() => {
    if (!selectedPath && flatFiles.length > 0) {
      setSelectedPath(flatFiles[0].path);
    }
  }, [flatFiles, selectedPath]);

  async function handleSave() {
    if (!selectedPath) return;
    setSaving(true);
    try {
      await saveWorkspaceFile(selectedPath, content);
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className={`workspace-panel${open ? " open" : ""}`}>
      <div className="workspace-panel-head">
        <div>
          <h2>Workspace</h2>
          <p>Browse and edit files on the PVC.</p>
        </div>
        <button className="panel-close-button" type="button" onClick={onClose}>Close</button>
      </div>
      {error ? <div className="page-state error">{error}</div> : null}
      <div className="workspace-panel-body">
        <div className="workspace-tree">
          {tree.map((node) => (
            <TreeNode key={node.path} node={node} selectedPath={selectedPath} onSelect={setSelectedPath} />
          ))}
        </div>
        <div className="workspace-editor-wrap">
          <div className="workspace-editor-head">
            <span>{selectedPath || "No file selected"}</span>
            <button className="lane-new-button" type="button" onClick={handleSave} disabled={!selectedPath || saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
          <textarea
            className="workspace-editor"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={!selectedPath || loading}
            placeholder={loading ? "Loading file..." : "Select a file to edit."}
          />
        </div>
      </div>
    </aside>
  );
}
