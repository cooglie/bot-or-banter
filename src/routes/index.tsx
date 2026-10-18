import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Human or Synth? – 60-Sekunden-Chat-Duell" },
      { name: "description", content: "Chatte 60 Sekunden und errate: Mensch oder heimliche KI?" },
      { property: "og:title", content: "Human or Synth? – 60-Sekunden-Chat-Duell" },
      { property: "og:description", content: "Chatte 60 Sekunden und errate: Mensch oder heimliche KI?" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Game,
});

type Secret = "human" | "synth";
type Msg = { role: "user" | "assistant"; content: string };
type Phase = "lobby" | "chat" | "vote" | "reveal";
const ROUND = 60;
const ALIASES = ["Nova", "Kai", "Mika", "Juno", "Ezra", "Lio", "Sam", "Rae"];


function Game() {
  const [nick, setNick] = useState("");
  const [phase, setPhase] = useState<Phase>("lobby");
  const [secret, setSecret] = useState<Secret>("human");
  const [alias, setAlias] = useState("Nova");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [left, setLeft] = useState(ROUND);
  const [guess, setGuess] = useState<Secret | null>(null);
  const [score, setScore] = useState({ w: 0, n: 0 });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNick(localStorage.getItem("hos-nick") ?? "");
    const s = localStorage.getItem("hos-score");
    if (s) setScore(JSON.parse(s));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, showTyping]);

  useEffect(() => {
    if (phase !== "chat") return;
    if (left <= 0) {
      abortRef.current?.abort();
      setTyping(false);
      setShowTyping(false);
      setPhase("vote");
      return;
    }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left]);

  function start() {
    if (!nick.trim()) return;
    localStorage.setItem("hos-nick", nick.trim());
    setSecret(Math.random() < 0.5 ? "human" : "synth");
    setAlias(ALIASES[Math.floor(Math.random() * ALIASES.length)] ?? "Nova");
    setMsgs([]);
    setGuess(null);
    setError(null);
    setLeft(ROUND);
    setPhase("chat");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || typing || phase !== "chat") return;
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setInput("");
    setTyping(true);
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, messages: next }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(
          res.status === 402
            ? "KI-Guthaben aufgebraucht."
            : res.status === 429
              ? "Zu viele Anfragen – kurz warten."
              : t || "Gegenüber hat die Verbindung verloren.",
        );
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let reply = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += dec.decode(value, { stream: true });
      }
      // human-like timing: read, think, then type (with pauses)
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const rand = (a: number, b: number) => a + Math.random() * (b - a);
      const readMs = 600 + text.length * rand(25, 45) + rand(300, 1800);
      const typeMs = reply.trim().length * rand(140, 240);
      const total = Math.min(11000, readMs + typeMs);
      const read = Math.min(readMs, total * 0.4);
      await wait(read);
      if (!ctrl.signal.aborted) setShowTyping(true);
      let typed = total - read;
      if (typed > 3500 && Math.random() < 0.4) {
        const pauseAt = typed * rand(0.3, 0.6);
        await wait(pauseAt);
        setShowTyping(false);
        await wait(rand(700, 1600));
        if (!ctrl.signal.aborted) setShowTyping(true);
        typed -= pauseAt;
      }
      await wait(typed);
      if (!ctrl.signal.aborted && reply.trim()) {
        setMsgs((m) => [...m, { role: "assistant", content: reply.trim() }]);
      }
    } catch (err) {
      if (!ctrl.signal.aborted) setError((err as Error).message);
    } finally {
      setTyping(false);
      setShowTyping(false);
      inputRef.current?.focus();
    }
  }

  function vote(g: Secret) {
    setGuess(g);
    const s = { w: score.w + (g === secret ? 1 : 0), n: score.n + 1 };
    setScore(s);
    localStorage.setItem("hos-score", JSON.stringify(s));
    setPhase("reveal");
  }

  const pct = (left / ROUND) * 100;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold tracking-tight">
          Human <span className="text-muted-foreground">or</span>{" "}
          <span className="text-primary">Synth?</span>
        </h1>
        <span className="font-mono text-xs text-muted-foreground">
          {score.w}/{score.n} richtig
        </span>
      </header>

      {phase === "lobby" && (
        <section className="flex flex-1 flex-col justify-center gap-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">60 Sekunden</p>
            <h2 className="mt-3 font-display text-5xl font-bold leading-[0.95]">
              Mensch oder Maschine?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Du chattest eine Minute mit einem Fremden. Vielleicht ein Mensch, vielleicht eine
              KI, die sich als Mensch tarnt. Dann stimmst du ab.
            </p>
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={20}
              placeholder="Dein Spitzname"
              className="h-12 rounded-lg border bg-card px-4 font-mono outline-none focus:border-primary"
            />
            <Button type="submit" size="lg" disabled={!nick.trim()} className="h-12 glow font-bold">
              Duell starten
            </Button>
          </form>
        </section>
      )}

      {phase !== "lobby" && (
        <section className="flex flex-1 flex-col">
          <div className="mb-3 flex items-center justify-between font-mono text-sm">
            <span>
              <span className="text-muted-foreground">mit</span> {alias}
            </span>
            <span className={left <= 10 && phase === "chat" ? "text-accent" : "text-primary"}>
              {phase === "chat" ? `00:${String(left).padStart(2, "0")}` : "ZEIT UM"}
            </span>
          </div>
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-linear"
              style={{ width: `${phase === "chat" ? pct : 0}%` }}
            />
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto rounded-xl border bg-card/60 p-3 min-h-[320px] max-h-[55vh]">
            {msgs.length === 0 && (
              <p className="py-10 text-center font-mono text-xs text-muted-foreground">
                Schreib die erste Nachricht. Stell fiese Fragen.
              </p>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground"
                      : "max-w-[80%] rounded-2xl rounded-bl-sm bg-secondary px-3 py-2"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {showTyping && (
              <div className="font-mono text-xs text-muted-foreground">
                {alias} tippt<span className="caret">_</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

          {phase === "chat" && (
            <form onSubmit={send} className="mt-3 flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={200}
                placeholder="Nachricht…"
                className="h-12 flex-1 rounded-lg border bg-card px-4 outline-none focus:border-primary"
              />
              <Button type="submit" size="lg" className="h-12" disabled={typing || !input.trim()}>
                Senden
              </Button>
            </form>
          )}

          {phase === "vote" && (
            <div className="mt-4">
              <p className="mb-3 text-center font-display text-lg font-semibold">
                Wer war {alias}?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button size="lg" variant="outline" className="h-16 border-human text-human text-lg" onClick={() => vote("human")}>
                  Mensch
                </Button>
                <Button size="lg" variant="outline" className="h-16 border-synth text-synth text-lg" onClick={() => vote("synth")}>
                  Synth
                </Button>
              </div>
            </div>
          )}

          {phase === "reveal" && guess && (
            <div className="mt-4 space-y-4 rounded-xl border bg-card p-4">
              <div className="text-center">
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {alias} war
                </p>
                <p className={`font-display text-4xl font-bold ${secret === "human" ? "text-human" : "text-synth"}`}>
                  {secret === "human" ? "MENSCH*" : "SYNTH"}
                </p>
                <p className="mt-1 font-semibold">
                  {guess === secret ? `Richtig, ${nick}!` : "Reingelegt."}
                </p>
              </div>
              {secret === "human" && (
                <p className="text-xs text-muted-foreground">
                  * Im Solo-Modus wird der Mensch von einer KI gespielt, die sich wie ein echter
                  Mensch verhält.
                </p>
              )}
              <Button size="lg" className="h-12 w-full glow font-bold" onClick={start}>
                Nächste Runde
              </Button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
