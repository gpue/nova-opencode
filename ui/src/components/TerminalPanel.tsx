import { FormEvent, useState } from "react";
import { runTerminalCommand } from "../lib/api";
import type { TerminalResult } from "../lib/types";

interface TerminalPanelProps {
  open: boolean;
  onClose: () => void;
}

export function TerminalPanel({ open, onClose }: TerminalPanelProps) {
  const [command, setCommand] = useState("");
  const [result, setResult] = useState<TerminalResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!command.trim()) return;
    setRunning(true);
    try {
      const output = await runTerminalCommand(command.trim());
      setResult(output);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terminal command failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className={`terminal-panel${open ? " open" : ""}`}>
      <div className="terminal-head">
        <div>
          <h2>Workspace terminal</h2>
          <p>Execute bash commands in /workspace.</p>
        </div>
        <button className="panel-close-button" type="button" onClick={onClose}>Close</button>
      </div>
      <form className="terminal-form" onSubmit={handleSubmit}>
        <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="e.g. ls -la" />
        <button className="lane-new-button" type="submit" disabled={running || !command.trim()}>
          {running ? "Running..." : "Run"}
        </button>
      </form>
      {error ? <div className="page-state error">{error}</div> : null}
      <div className="terminal-output">
        {result ? (
          <>
            <div className="terminal-output-head">$ {result.command}</div>
            {result.stdout ? <pre>{result.stdout}</pre> : null}
            {result.stderr ? <pre className="terminal-stderr">{result.stderr}</pre> : null}
            <div className="terminal-exit">Exit code: {result.exitCode}</div>
          </>
        ) : (
          <div className="lane-empty">No command run yet.</div>
        )}
      </div>
    </section>
  );
}
