"use client";

import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Physics } from "@/lib/physics";
import { GAME_CONFIG, PU_TYPES, UPG_DEFS } from "@/lib/game-constants";
import type { Entity, Player, Bullet, Asteroid, Enemy, Boss, Powerup } from "@/types/game";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const { W, H } = GAME_CONFIG;

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  
  // Game state refs (mutable, no re-renders)
  const stateRef = useRef({
    state: "menu" as "menu" | "playing" | "paused" | "gameover" | "win" | "upgrade",
    score: 0,
    lives: 3,
    wave: 1,
    hiScore: 0,
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    frame: 0,
  });

  // Entities
  const playerRef = useRef<Player>({
    x: W / 2, y: H / 2, vx: 0, vy: 0, rot: 0, r: 14, av: 0,
    shield: 0, invincible: 0, boost: 0, boostCooldown: 0,
  });
  const asteroidsRef = useRef<Asteroid[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Entity[]>([]);
  const powerupsRef = useRef<Powerup[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const bossRef = useRef<Boss | null>(null);

  // Input refs
  const keysRef = useRef<Record<string, boolean>>({});
  const mouseRef = useRef({ x: W / 2, y: H / 2, down: false });

  // UI state (for React-rendered overlays)
  const [hud, setHud] = useState({
    score: 0,
    wave: 1,
    lives: 3,
    multiplier: 1,
    hiScore: 0,
    bossHp: 100,
    showBoss: false,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    // Input handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === "Space") {
        e.preventDefault();
        mouseRef.current.down = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
      if (e.code === "Space") mouseRef.current.down = false;
    };
    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const sx = containerRef.current!.offsetWidth / W;
      const sy = containerRef.current!.offsetHeight / H;
      mouseRef.current.x = (e.clientX - rect.left) / sx;
      mouseRef.current.y = (e.clientY - rect.top) / sy;
      if (stateRef.current.state === "playing") {
        playerRef.current.rot = Math.atan2(
          mouseRef.current.x - playerRef.current.x,
          -(mouseRef.current.y - playerRef.current.y)
        );
      }
    };
    const handleMouseDown = () => (mouseRef.current.down = true);
    const handleMouseUp = () => (mouseRef.current.down = false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    containerRef.current.addEventListener("mousemove", handleMouseMove);
    containerRef.current.addEventListener("mousedown", handleMouseDown);
    containerRef.current.addEventListener("mouseup", handleMouseUp);

    // Initialize PixiJS
    const app = new PIXI.Application();
    let isCancelled = false;
    
    const initPixi = async () => {
      await app.init({
        width: W,
        height: H,
        background: 0x00000a,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (isCancelled) {
        app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true, texture: true, textureSource: true });
        return;
      }
      appRef.current = app;
      
      app.canvas.style.width = "100%";
      app.canvas.style.height = "auto";
      app.canvas.style.display = "block";
      containerRef.current!.appendChild(app.canvas);

      // Containers
      const bgLayer = new PIXI.Container();
      const gameLayer = new PIXI.Container();
      const fxLayer = new PIXI.Container();
      app.stage.addChild(bgLayer, gameLayer, fxLayer);

      // Stars background
      const starsGfx = new PIXI.Graphics();
      bgLayer.addChild(starsGfx);
      
      const stars: Array<{x: number, y: number, s: number, a: number, tw: number}> = [];
      for (let i = 0; i < 280; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          s: Math.random() * 1.6 + 0.2,
          a: Math.random() * 0.8 + 0.2,
          tw: Math.random() * 200,
        });
      }

      const drawStars = () => {
        starsGfx.clear();
        for (const s of stars) {
          const alpha = s.a * (0.5 + 0.5 * Math.sin(stateRef.current.frame / s.tw));
          starsGfx.circle(s.x, s.y, s.s).fill({ color: 0xffffff, alpha });
        }
      };

    // Player graphics
    const shipGfx = new PIXI.Graphics();
    gameLayer.addChild(shipGfx);

    const drawShip = (thrusting: boolean, boosting: boolean) => {
      shipGfx.clear();
      // Engine particles
      if (thrusting || boosting) {
        const fl = boosting ? 28 : 18;
        shipGfx.poly([-5, 12, -9, fl + Math.random() * 6, 0, fl - 4, 9, fl + Math.random() * 6, 5, 12])
               .fill({ color: boosting ? 0x00ffff : 0xff6600, alpha: 0.9 });
      }
      // Ship body
      shipGfx.poly([0, -18, -12, 14, 0, 8, 12, 14])
             .fill({ color: 0x001a33, alpha: 0.85 })
             .stroke({ width: 1.5, color: 0x00ffcc, alpha: 1 });
    };


    // Game loop
    const gameLoop = () => {
      if (stateRef.current.state !== "playing") {
        drawStars();
        return;
      }

      stateRef.current.frame++;
      const player = playerRef.current;

      // Player movement
      const spd = 0.2;
      if (keysRef.current["ArrowLeft"] || keysRef.current["KeyA"]) player.rot -= 0.07;
      if (keysRef.current["ArrowRight"] || keysRef.current["KeyD"]) player.rot += 0.07;
      if (keysRef.current["ArrowUp"] || keysRef.current["KeyW"]) {
        const t = Physics.thrust(player.rot, spd);
        player.vx += t.vx;
        player.vy += t.vy;
      }
      Physics.clampSpeed(player, 5.5);
      player.vx *= 0.982;
      player.vy *= 0.982;
      player.x += player.vx;
      player.y += player.vy;
      Physics.wrap(player, W, H);

      // Drawing
      drawShip(
        keysRef.current["ArrowUp"] || keysRef.current["KeyW"],
        false
      );
      shipGfx.x = player.x;
      shipGfx.y = player.y;
      shipGfx.rotation = player.rot;

      // Update HUD (throttled)
      if (stateRef.current.frame % 10 === 0) {
        setHud(prev => ({
          ...prev,
          score: stateRef.current.score,
          wave: stateRef.current.wave,
          lives: stateRef.current.lives,
          multiplier: stateRef.current.multiplier,
          hiScore: stateRef.current.hiScore,
        }));
      }

      drawStars();
    };

      app.ticker.add(gameLoop);
    };

    initPixi();

    // Cleanup
    return () => {
      isCancelled = true;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      containerRef.current?.removeEventListener("mousemove", handleMouseMove);
      containerRef.current?.removeEventListener("mousedown", handleMouseDown);
      containerRef.current?.removeEventListener("mouseup", handleMouseUp);
      if (appRef.current) {
        app.ticker.stop();
        app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true, texture: true, textureSource: true });
        appRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full max-w-[820px] mx-auto">
      <div
        ref={containerRef}
        className="w-full rounded-xl bg-black overflow-hidden cursor-crosshair touch-none"
        style={{ aspectRatio: `${W}/${H}` }}
      />
      
      {/* React-rendered HUD overlay */}
      <div className="absolute top-3 left-4 right-4 flex justify-between text-xs pointer-events-none gap-2">
        <Card className="bg-black/60 border-[#00ffcc33] text-white flex-1 max-w-[100px]">
          <CardContent className="p-2 text-center flex flex-col justify-center items-center">
            <div className="text-[9px] opacity-60 tracking-wider">SCORE</div>
            <div className="text-lg font-bold text-[#00ffcc] text-shadow-glow">{hud.score}</div>
          </CardContent>
        </Card>
        <Card className="bg-black/60 border-[#00ffcc33] text-white flex-1 max-w-[100px]">
          <CardContent className="p-2 text-center flex flex-col justify-center items-center">
            <div className="text-[9px] opacity-60 tracking-wider">WAVE</div>
            <div className="text-lg font-bold">{hud.wave}</div>
          </CardContent>
        </Card>
        <Card className="bg-black/60 border-[#00ffcc33] text-white flex-1 max-w-[120px]">
          <CardContent className="p-2 text-center flex flex-col justify-center items-center">
            <div className="text-[9px] opacity-60 tracking-wider">LIVES</div>
            <div className="text-sm tracking-widest pt-0.5 text-[#ff4444]">{"♥ ".repeat(hud.lives)}</div>
          </CardContent>
        </Card>
        <Card className="bg-black/60 border-[#00ffcc33] text-white flex-1 max-w-[100px]">
          <CardContent className="p-2 text-center flex flex-col justify-center items-center">
            <div className="text-[9px] opacity-60 tracking-wider">MULTI</div>
            <div className="text-lg font-bold text-[#ffcc00]">x{hud.multiplier}</div>
          </CardContent>
        </Card>
        <Card className="bg-black/60 border-[#00ffcc33] text-white flex-1 max-w-[100px]">
          <CardContent className="p-2 text-center flex flex-col justify-center items-center">
            <div className="text-[9px] opacity-60 tracking-wider">HI-SCORE</div>
            <div className="text-sm font-bold pt-0.5">{hud.hiScore}</div>
          </CardContent>
        </Card>
      </div>

      {/* Boss health bar */}
      {hud.showBoss && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[300px] flex flex-col items-center gap-1">
          <div className="text-[#ff4444] text-[10px] tracking-widest font-bold">BOSS DETECTED</div>
          <Progress value={hud.bossHp} className="h-2 w-full bg-[#1a0000] border border-[#ff444455] [&>div]:bg-gradient-to-r [&>div]:from-[#ff0000] [&>div]:to-[#ff6600]" />
        </div>
      )}

      {/* Minimap */}
      <div className="absolute bottom-3 right-3 w-20 h-12 bg-black/50 border border-[#00ffcc33] rounded overflow-hidden shadow-lg">
        <canvas id="mmCanvas" width={80} height={50} className="w-full h-full" />
      </div>

      {/* Start/Game Over Screen */}
      {stateRef.current.state === "menu" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm rounded-xl pointer-events-auto z-50">
          <Card className="w-full max-w-md bg-black/90 border-[#00ffcc55] text-white shadow-2xl shadow-[#00ffcc]/20">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-3xl font-bold tracking-wider text-[#00ffcc] text-shadow-glow">
                SPACE MARINE
              </CardTitle>
              <CardDescription className="text-[#ffcc00]/70 text-sm mt-2">
                HI-SCORE: {hud.hiScore}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6 pt-4">
              <p className="text-sm text-center text-gray-300 leading-relaxed">
                Survive all waves • Collect power-ups • Defeat bosses<br />
                <span className="text-[#00ffcc] opacity-80">WASD/Arrows</span> = move • <span className="text-[#00ffcc] opacity-80">Mouse aim</span> • <span className="text-[#00ffcc] opacity-80">Click/Space</span> = fire<br />
                <span className="text-[#00ffcc] opacity-80">Shift</span> = boost • <span className="text-[#00ffcc] opacity-80">[ ]</span> = strafe • <span className="text-[#00ffcc] opacity-80">B</span> = smart bomb
              </p>
              
              <Button 
                variant="outline"
                className="w-full py-6 bg-transparent border-2 border-[#00ffcc] text-[#00ffcc] font-mono text-lg tracking-widest hover:bg-[#00ffcc22] hover:text-[#00ffcc] transition-all pointer-events-auto shadow-lg shadow-[#00ffcc]/10"
                onClick={() => { stateRef.current.state = "playing"; }}
              >
                START GAME
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}