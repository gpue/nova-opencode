import { useEffect, useRef, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const commandRef = useRef("");
  const runningRef = useRef(false);

  function prompt() {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.write("\r\n\x1b[35mnova-opencode\x1b[0m:\x1b[36m/workspace\x1b[0m$ ");
    commandRef.current = "";
  }

  function writeResult(result: TerminalResult) {
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (result.stdout) terminal.writeln(result.stdout.trimEnd());
    if (result.stderr) terminal.writeln(`\x1b[31m${result.stderr.trimEnd()}\x1b[0m`);
    terminal.writeln(`\x1b[90mexit ${result.exitCode}\x1b[0m`);
    prompt();
  }

  useEffect(() => {
    if (!hostRef.current || terminalRef.current) return;
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
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
    prompt();

    terminal.onData(async (data) => {
      if (!open) return;
      if (runningRef.current) return;
      if (data === "\r") {
        const command = commandRef.current.trim();
        runningRef.current = true;
        terminal.write("\r\n");
        if (!command) {
          runningRef.current = false;
          prompt();
          return;
        }
        try {
          const result = await runTerminalCommand(command);
          writeResult(result);
          setError(null);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Terminal command failed";
          setError(message);
          terminal.writeln(`\x1b[31m${message}\x1b[0m`);
          prompt();
        } finally {
          runningRef.current = false;
        }
        return;
      }
      if (data === "\u007f") {
        if (commandRef.current.length > 0) {
          commandRef.current = commandRef.current.slice(0, -1);
          terminal.write("\b \b");
        }
        return;
      }
      if (data >= " ") {
        commandRef.current += data;
        terminal.write(data);
      }
    });

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
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      window.setTimeout(() => fitRef.current?.fit(), 50);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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
        {error ? <div className="page-state error terminal-error">{error}</div> : null}
      </div>
    </section>
  );
}
