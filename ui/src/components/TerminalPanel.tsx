import { FormEvent, useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { runTerminalCommand } from "../lib/api";
import type { TerminalResult } from "../lib/types";

interface TerminalPanelProps {
  open: boolean;
  onClose: () => void;
}

export function TerminalPanel({ open, onClose }: TerminalPanelProps) {
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!hostRef.current || terminalRef.current) return;
    const terminal = new Terminal({
      convertEol: true,
      theme: {
        background: "#0b1020",
        foreground: "#e2e8f0",
        cursor: "#5eead4",
        selectionBackground: "rgba(142,86,252,0.24)",
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    fitAddon.fit();
    terminal.writeln("Nova OpenCode terminal ready.");
    terminal.writeln("$ ");
    terminalRef.current = terminal;
    fitRef.current = fitAddon;
    const onResize = () => fitAddon.fit();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => fitRef.current?.fit(), 50);
    }
  }, [open]);

  function writeResult(result: TerminalResult) {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.writeln(`$ ${result.command}`);
    if (result.stdout) terminal.writeln(result.stdout.trimEnd());
    if (result.stderr) terminal.writeln(`\x1b[31m${result.stderr.trimEnd()}\x1b[0m`);
    terminal.writeln(`\x1b[90mexit ${result.exitCode}\x1b[0m`);
    terminal.writeln("$ ");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!command.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const output = await runTerminalCommand(command.trim());
      writeResult(output);
      setCommand("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terminal command failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className={`terminal-overlay${open ? " open" : ""}`}>
      <div className="terminal-overlay-backdrop" onClick={onClose} />
      <div className="terminal-panel terminal-panel-sheet">
        <div className="terminal-head">
          <div>
            <h2>Workspace terminal</h2>
            <p>Execute bash commands in /workspace.</p>
          </div>
          <button className="panel-close-button" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="terminal-screen" ref={hostRef} />
        <form className="terminal-form" onSubmit={handleSubmit}>
          <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="e.g. ls -la" />
          <button className="lane-new-button" type="submit" disabled={running || !command.trim()}>
            {running ? "Running..." : "Run"}
          </button>
        </form>
        {error ? <div className="page-state error terminal-error">{error}</div> : null}
      </div>
    </section>
  );
}
