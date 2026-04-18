"use client";

import dynamic from "next/dynamic";

// Dynamically import the game canvas (client-only)
const GameCanvas = dynamic(() => import("@/components/game/GameCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-2xl font-bold mb-4">🚀 Loading Space Marine...</div>
        <div className="animate-pulse text-sm opacity-70">Initializing physics engine...</div>
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <GameCanvas />
    </main>
  );
}