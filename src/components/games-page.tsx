"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { TaskHistory as DbTaskHistory } from "@/lib/database.types";
import { todayISO, playSound } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveGame = null | "breather" | "match";

// ─── Focus Breather (4-4-4 box breathing) ────────────────────────────────────

type BreathPhase = "inhale" | "hold" | "exhale";

const BREATH_LABELS: Record<BreathPhase, string> = {
  inhale: "Inhale",
  hold: "Hold",
  exhale: "Exhale",
};

const PHASE_ORDER: BreathPhase[] = ["inhale", "hold", "exhale"];
const PHASE_DURATION = 4000; // ms per phase

function FocusBreather({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<BreathPhase>("inhale");
  const [progress, setProgress] = useState(0); // 0–1 within phase
  const [cycleCount, setCycleCount] = useState(0);
  const startRef = useRef<number>(Date.now());
  const phaseIndexRef = useRef(0);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const p = Math.min(elapsed / PHASE_DURATION, 1);
      setProgress(p);
      if (p >= 1) {
        const nextIndex = (phaseIndexRef.current + 1) % PHASE_ORDER.length;
        phaseIndexRef.current = nextIndex;
        setPhase(PHASE_ORDER[nextIndex]);
        startRef.current = Date.now();
        setProgress(0);
        if (nextIndex === 0) {
          setCycleCount((c) => c + 1);
          playSound("/calm-alarm.wav");
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scale = phase === "inhale"
    ? 0.6 + progress * 0.4
    : phase === "hold"
    ? 1.0
    : 1.0 - progress * 0.4;

  const ringColor = "#6f57f6";
  const bgColor = "#f0ecff";

  return (
    <div className="flex flex-col items-center justify-center px-6 py-8" style={{ background: bgColor, minHeight: 340, borderRadius: "1.5rem" }}>
      <div className="flex items-center justify-between w-full mb-6">
        <p className={`text-xs font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>
          {cycleCount > 0 ? `${cycleCount} cycle${cycleCount > 1 ? "s" : ""}` : "Breathe"}
        </p>
        <button aria-label="Close" type="button" onClick={onClose} className={`rounded-full p-3 bg-white/60 dark:bg-white/10`}>
          <X className={`h-4 w-4 text-[#8e88a9] dark:text-white/40`} />
        </button>
      </div>

      {/* Breathing circle */}
      <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
        {/* Outer ring */}
        <div
          className="absolute rounded-full border-2 transition-none"
          style={{
            width: 200 * scale,
            height: 200 * scale,
            borderColor: ringColor,
            opacity: 0.2,
          }}
        />
        {/* Inner filled */}
        <div
          className="absolute rounded-full"
          style={{
            width: 160 * scale,
            height: 160 * scale,
            background: `radial-gradient(circle, ${ringColor}55 0%, ${ringColor}22 100%)`,
          }}
        />
        <p className={`relative text-lg font-bold z-10 text-[#6f57f6] dark:text-[#cabfff]`}>
          {BREATH_LABELS[phase]}
        </p>
      </div>

      {/* Phase dots */}
      <div className="flex gap-2 mt-8">
        {PHASE_ORDER.map((p) => (
          <div
            key={p}
            className="h-2 w-2 rounded-full transition-all"
            style={{ background: p === phase ? ringColor : `${ringColor}40` }}
          />
        ))}
      </div>

      <p className={`mt-4 text-xs text-[#8e88a9] dark:text-white/40`}>
        4 seconds each phase · free · no credits
      </p>
    </div>
  );
}

// ─── Dopamine Match ───────────────────────────────────────────────────────────

const MATCH_SYMBOLS = ["⚡", "🎯", "🌱", "🧠", "🔥", "💎", "🎲", "⭐"];

type MatchCard = {
  id: number;
  symbol: string;
  flipped: boolean;
  matched: boolean;
};

type MatchPhase = "idle" | "playing" | "won" | "no-credits";

function DopamineMatch({
  playCredits,
  onClose,
  onWin,
  onSpendCredit,
}: {
  playCredits: number;
  onClose: () => void;
  onWin: () => void;
  onSpendCredit: () => void;
}) {
  const [matchPhase, setMatchPhase] = useState<MatchPhase>("idle");
  const [cards, setCards] = useState<MatchCard[]>([]);
  const [flippedIds, setFlippedIds] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const lockedRef = useRef(false);

  function buildDeck(): MatchCard[] {
    const pairs = [...MATCH_SYMBOLS, ...MATCH_SYMBOLS];
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    return pairs.map((symbol, id) => ({ id, symbol, flipped: false, matched: false }));
  }

  function startGame() {
    if (playCredits < 1) { setMatchPhase("no-credits"); return; }
    onSpendCredit();
    playSound("/card-shuffle.mp3");
    setCards(buildDeck());
    setFlippedIds([]);
    setMoves(0);
    setMatchPhase("playing");
    lockedRef.current = false;
  }

  function handleCardClick(id: number) {
    if (lockedRef.current || matchPhase !== "playing") return;
    const card = cards[id];
    if (!card || card.flipped || card.matched) return;
    playSound("/card-flip.mp3");

    const newFlipped = [...flippedIds, id];
    setFlippedIds(newFlipped);
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, flipped: true } : c));

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      lockedRef.current = true;
      const [a, b] = newFlipped;
      const aCard = cards[a];
      const bCard = cards[b];
      if (aCard.symbol === bCard.symbol) {
        const updated = cards.map((c) =>
          c.id === a || c.id === b ? { ...c, flipped: true, matched: true } : c
        );
        setCards(updated);
        setFlippedIds([]);
        lockedRef.current = false;
        if (updated.every((c) => c.matched)) {
          setMatchPhase("won");
          onWin();
          playSound("/calm-alarm.wav");
        }
      } else {
        setTimeout(() => {
          setCards((prev) => prev.map((c) => c.id === a || c.id === b ? { ...c, flipped: false } : c));
          setFlippedIds([]);
          lockedRef.current = false;
        }, 900);
      }
    }
  }

  const cardFace = "#6f57f6";

  if (matchPhase === "idle" || matchPhase === "no-credits") {
    return (
      <div className={`flex flex-col items-center px-6 py-8 rounded-[1.5rem] bg-[#f0ecff] dark:bg-[#130e24]`}>
        <div className="flex items-center justify-between w-full mb-4">
          <p className={`text-xs font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>Dopamine Match</p>
          <button aria-label="Close" type="button" onClick={onClose} className={`rounded-full p-3 bg-white/60 dark:bg-white/10`}>
            <X className={`h-4 w-4 text-[#8e88a9] dark:text-white/40`} />
          </button>
        </div>
        <p className="text-4xl mb-3">🧠</p>
        <p className={`text-sm mb-1 text-[#27304c] dark:text-white/80`}>Match all 8 pairs to win</p>
        <p className={`text-xs mb-6 text-[#8e88a9] dark:text-white/40`}>Costs 1 play credit · Win = 5 XP</p>
        {matchPhase === "no-credits" && (
          <p className={`mb-4 text-xs font-semibold text-red-500 dark:text-red-400`}>No play credits — complete tasks to earn more</p>
        )}
        <p className={`mb-6 text-sm font-bold text-[#6f57f6] dark:text-[#cabfff]`}>{playCredits} credit{playCredits !== 1 ? "s" : ""} available</p>
        <button
          type="button"
          disabled={playCredits < 1}
          onClick={startGame}
          className={`w-full rounded-2xl py-3 text-sm font-black disabled:opacity-40 bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]`}
        >
          Play — 1 credit
        </button>
      </div>
    );
  }

  if (matchPhase === "won") {
    return (
      <div className={`flex flex-col items-center px-6 py-10 rounded-[1.5rem] bg-[#f0ecff] dark:bg-[#130e24]`}>
        <p className="text-5xl mb-3">🎉</p>
        <p className={`text-lg font-black mb-1 text-[#17203a] dark:text-white`}>You matched them all!</p>
        <p className={`text-sm mb-6 text-[#8e88a9] dark:text-white/40`}>{moves} moves · +5 XP earned</p>
        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={startGame}
            disabled={playCredits < 1}
            className={`flex-1 rounded-2xl py-3 text-sm font-black disabled:opacity-40 bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]`}
          >
            Play again
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 rounded-2xl py-3 text-sm font-bold bg-[#e5e0f5] text-[#6f57f6] dark:bg-white/10 dark:text-white/70`}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`px-4 py-5 rounded-[1.5rem] bg-[#f0ecff] dark:bg-[#130e24]`}>
      <div className="flex items-center justify-between mb-4">
        <p className={`text-xs font-semibold text-[#8e88a9] dark:text-white/40`}>{moves} moves</p>
        <p className={`text-xs font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>Dopamine Match</p>
        <button aria-label="Close" type="button" onClick={onClose} className={`rounded-full p-3 bg-white/60 dark:bg-white/10`}>
          <X className={`h-4 w-4 text-[#8e88a9] dark:text-white/40`} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => handleCardClick(card.id)}
            className={`flex h-16 items-center justify-center rounded-xl text-2xl transition-all active:scale-95 ${
              card.flipped || card.matched
                ? card.matched
                  ? "bg-[#ede8ff] shadow-[0_0_12px_rgba(111,87,246,0.2)] dark:bg-[#22193f]"
                  : "bg-white shadow-sm dark:bg-white/15"
                : "bg-[#d8d0f8] dark:bg-[#2a1f52]"
            }`}
            style={{ color: cardFace }}
          >
            {card.flipped || card.matched ? card.symbol : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Games Hub ────────────────────────────────────────────────────────────────

export function GamesPage({
  taskHistory,
  onAwardXP,
}: {
  taskHistory: DbTaskHistory[];
  onAwardXP: (xp: number, reason: string) => void;
}) {
  const [activeGame, setActiveGame] = useState<ActiveGame>(null);
  const [playCredits, setPlayCredits] = useState(0);

  const today = todayISO();
  const todayCredits = useMemo(
    () => taskHistory.filter((h) => h.entry_date === today && h.was_completed).length,
    [taskHistory, today]
  );

  // Sync credits on load (use tasks done today as the credit pool)
  useEffect(() => {
    setPlayCredits(todayCredits);
  }, [todayCredits]);

  if (activeGame === "breather") {
    return (
      <section className="px-4 pb-32 pt-4">
        <FocusBreather onClose={() => setActiveGame(null)} />
      </section>
    );
  }

  if (activeGame === "match") {
    return (
      <section className="px-4 pb-32 pt-4">
        <DopamineMatch
          playCredits={playCredits}
          onClose={() => setActiveGame(null)}
          onWin={() => onAwardXP(5, "Dopamine Match win")}
          onSpendCredit={() => setPlayCredits((c) => Math.max(0, c - 1))}
        />
      </section>
    );
  }

  // Hub shell
  const games: {
    key: ActiveGame;
    title: string;
    emoji: string;
    description: string;
    cost: string;
    locked: boolean;
  }[] = [
    {
      key: "breather",
      title: "Focus Breather",
      emoji: "🌊",
      description: "4-4-4 box breathing to reset your nervous system",
      cost: "Free",
      locked: false,
    },
    {
      key: "match",
      title: "Dopamine Match",
      emoji: "🧠",
      description: "Flip and match 8 pairs to earn 5 XP",
      cost: "1 credit",
      locked: false,
    },
    {
      key: null,
      title: "Task War",
      emoji: "⚔️",
      description: "Battle your tasks in a card duel",
      cost: "Coming soon",
      locked: true,
    },
  ];

  return (
    <section className="px-4 pb-32">
      {/* Header */}
      <div className="pt-6 pb-4">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e88a9] dark:text-white/40`}>Games</p>
        <h1 className={`mt-1 text-3xl font-black tracking-tight text-[#17203a] dark:text-white`}>Recharge Hub</h1>
      </div>

      {/* Play credits */}
      <div className={`mb-6 flex items-center gap-4 rounded-2xl px-5 py-4 bg-[#f7f5ff] dark:bg-white/5`}>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl bg-[#ede8ff] dark:bg-[#22193f]`}>
          🎮
        </div>
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>Play Credits</p>
          <p className={`text-2xl font-black tabular-nums text-[#17203a] dark:text-white`}>{playCredits}</p>
          <p className={`text-xs text-[#8e88a9] dark:text-white/40`}>1 credit per task completed today</p>
        </div>
      </div>

      {/* Game cards */}
      <div className="flex flex-col gap-3">
        {games.map((game) => (
          <button
            key={game.title}
            type="button"
            disabled={game.locked}
            onClick={() => { if (!game.locked && game.key) setActiveGame(game.key); }}
            className={`flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition active:scale-[0.98] disabled:opacity-50 bg-[#f7f5ff] dark:bg-white/5 ${game.locked ? "cursor-default" : ""}`}
          >
            <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-3xl bg-[#ede8ff] dark:bg-[#22193f]`}>
              {game.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-sm text-[#17203a] dark:text-white`}>{game.title}</p>
              <p className={`text-xs mt-0.5 truncate text-[#27304c] dark:text-white/70`}>{game.description}</p>
            </div>
            <div className="flex-shrink-0">
              <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold ${
                game.locked
                  ? "bg-[#e5e0f5] text-[#8e88a9] dark:bg-white/5 dark:text-white/30"
                  : "bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"
              }`}>
                {game.cost}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
