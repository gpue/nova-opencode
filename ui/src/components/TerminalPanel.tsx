import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { runTerminalCommand } from "../lib/api";
import type { TerminalResult } from "../lib/types";
import { Icon } from "./Icon";

interface TerminalPanelProps {
  open: boolean;
  onClose: () => void;
}

export function TerminalPanel({ open, onClose }: TerminalPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(420);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const commandRef = useRef("");
  const runningRef = useRef(false);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  function prompt() {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.write("\r\n\x1b[35mnova-opencode\x1b[0m:\x1b[36m/workspace\x1b[0m$ ");
    commandRef.current = "";
  }

  function writeResult(result: TerminalResult) {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const hasOutput = Boolean(result.stdout || result.stderr);
    if (result.stdout) {
      terminal.write(result.stdout.replace(/\n/g, "\r\n"));
      if (!result.stdout.endsWith("\n")) terminal.write("\r\n");
    }
    if (result.stderr) {
      terminal.write(`\x1b[31m${result.stderr.replace(/\n/g, "\r\n")}\x1b[0m`);
      if (!result.stderr.endsWith("\n")) terminal.write("\r\n");
    }
    if (!hasOutput) {
      terminal.writeln("\x1b[90m(no output)\x1b[0m");
    }
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

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => fitRef.current?.fit());
  }, [height, open]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!resizeRef.current) return;
      const next = resizeRef.current.startHeight + (resizeRef.current.startY - event.clientY);
      setHeight(Math.max(260, Math.min(window.innerHeight - 120, next)));
    };
    const handleUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    resizeRef.current = { startY: event.clientY, startHeight: height };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <section className={`terminal-overlay${open ? " open" : ""}`}>
      <div className="terminal-overlay-backdrop" onClick={onClose} />
      <div className="terminal-panel terminal-panel-sheet" style={{ height }}>
        <button className="terminal-resize-handle" type="button" aria-label="Resize terminal" onPointerDown={startResize} />
        <div className="terminal-head">
          <div>
            <h2>Workspace terminal</h2>
            <p>Execute bash commands in /workspace.</p>
          </div>
          <button className="panel-close-button" type="button" onClick={onClose} title="Close terminal">
            <Icon name="close" width="14" height="14" />
            <span>Close</span>
          </button>
        </div>
        <div className="terminal-screen" ref={hostRef} />
        {error ? <div className="page-state error terminal-error">{error}</div> : null}
      </div>
    </section>
  );
}
