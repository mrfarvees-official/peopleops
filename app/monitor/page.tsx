"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface LogEntry {
  seq: number;
  time: string;
  level: string;
  msg: string;
  data: Record<string, unknown>;
}
interface Snapshot {
  uptimeSec: number;
  node: string;
  pid: number;
  process: {
    cpuPercent: number;
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  eventLoopLagMs: { p50: number; p99: number };
  system: { cpus: number; totalMemMb: number; freeMemMb: number };
  logCounts: Record<string, number>;
}

const LEVEL_COLOR: Record<string, string> = {
  trace: "text-gray-400",
  debug: "text-gray-500",
  info: "text-blue-600",
  warn: "text-amber-600",
  error: "text-red-600",
  fatal: "text-red-800 font-bold",
};

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

export default function MonitorPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState("info");
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSeq = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const prevUptime = useRef<number | null>(null);

  const changeLevel = (next: string) => {
    lastSeq.current = 0;
    setLogs([]);
    setLevel(next);
  };

  const tick = useCallback(async () => {
    if (busy.current) return; // skip if the previous request is still running
    busy.current = true;
    try {
      const [m, l] = await Promise.all([
        fetch("/api/monitor", { cache: "no-store" }),
        fetch(`/api/logs?after=${lastSeq.current}&level=${level}`, {
          cache: "no-store",
        }),
      ]);
      if (!m.ok || !l.ok) throw new Error("Monitor disabled or unavailable");
      const next = (await m.json()) as Snapshot;
      const { entries } = (await l.json()) as { entries: LogEntry[] };

      // Uptime went backwards: the server restarted and sequence numbers started over
      if (prevUptime.current !== null && next.uptimeSec < prevUptime.current) {
        lastSeq.current = 0;
        setLogs([]);
      }
      prevUptime.current = next.uptimeSec;
      setSnap(next);

      if (entries.length) {
        lastSeq.current = entries[entries.length - 1]!.seq;
        setLogs((prev) => {
          const seen = new Set(prev.map((e) => e.seq));
          return [...prev, ...entries.filter((e) => !seen.has(e.seq))].slice(
            -500,
          );
        });
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      busy.current = false;
    }
  }, [level]);

  useEffect(() => {
    if (paused) return;
    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => clearInterval(id);
  }, [tick, paused]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [logs]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Live monitor</h1>
        <button
          className="rounded border px-3 py-1 text-sm"
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </header>

      {error && <p className="text-red-600">{error}</p>}

      {snap && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card label="Process CPU" value={`${snap.process.cpuPercent}%`} />
          <Card label="RSS memory" value={`${snap.process.rssMb} MB`} />
          <Card
            label="Heap used"
            value={`${snap.process.heapUsedMb} / ${snap.process.heapTotalMb} MB`}
          />
          <Card
            label="Event loop lag p99"
            value={`${snap.eventLoopLagMs.p99} ms`}
          />
          <Card
            label="System free RAM"
            value={`${snap.system.freeMemMb} / ${snap.system.totalMemMb} MB`}
          />
          <Card label="CPU cores" value={String(snap.system.cpus)} />
          <Card label="Uptime" value={`${snap.uptimeSec}s`} />
          <Card label="Node / PID" value={`${snap.node} / ${snap.pid}`} />
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center gap-3">
          <h2 className="font-semibold">Structured logs</h2>
          <select
            className="rounded border px-2 py-1 text-sm"
            value={level}
            onChange={(e) => changeLevel(e.target.value)}
          >
            {["trace", "debug", "info", "warn", "error"].map((l) => (
              <option key={l} value={l}>
                {l}+
              </option>
            ))}
          </select>
          {snap && (
            <span className="text-xs text-gray-500">
              {Object.entries(snap.logCounts)
                .map(([k, v]) => `${k}: ${v}`)
                .join("  ")}
            </span>
          )}
        </div>
        <div
          ref={box}
          className="h-96 overflow-auto rounded-lg border bg-gray-50 p-2 font-mono text-xs"
        >
          {logs.length === 0 && (
            <div className="text-gray-400">
              No logs yet. Open /api/health to create some.
            </div>
          )}
          {logs.map((e) => (
            <div key={e.seq} className="border-b border-gray-100 py-1">
              <span className="text-gray-400">{e.time.slice(11, 19)}</span>{" "}
              <span className={LEVEL_COLOR[e.level]}>
                {e.level.toUpperCase().padEnd(5)}
              </span>{" "}
              <span>{e.msg}</span>{" "}
              <span className="text-gray-500">{JSON.stringify(e.data)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
