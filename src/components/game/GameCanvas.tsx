"use client";

import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Physics } from "@/lib/physics";
import { GAME_CONFIG, PU_TYPES, UPG_DEFS } from "@/lib/game-constants";
import type { Entity, Player, Bullet, Asteroid, Enemy, Boss, Powerup, Particle, Debris } from "@/types/game";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const { W, H } = GAME_CONFIG;

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mmCanvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  
  // Extended Game State
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
    nextWaveTimer: -1,
    announceTimer: 0,
    shootCooldown: 0,
    autoFireTimer: 0,
    ammo: 10,
    maxAmmo: 12,
    ammoRegen: 0,
    activePU: { shield: 0, rapid: 0, trishot: 0, slow: 0, magnet: 0 } as Record<string, number>,
    upgrades: { speed: 0, fireRate: 0, triShot: 0, shield: 0, bomb: 0 } as Record<string, number>,
    announceText: "",
    announceOpacity: 0,
  });

  // Entities
  const playerRef = useRef<Player>({
    x: W / 2, y: H / 2, vx: 0, vy: 0, rot: 0, r: 14, av: 0,
    shield: 0, invincible: 0, boost: 0, boostCooldown: 0,
  });
  const asteroidsRef = useRef<Asteroid[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const powerupsRef = useRef<Powerup[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const bossRef = useRef<Boss | null>(null);

  // Input refs
  const keysRef = useRef<Record<string, boolean>>({});
  const mouseRef = useRef({ x: W / 2, y: H / 2, down: false });

  // UI state for React Overlays
  const [hud, setHud] = useState({
    state: "menu",
    score: 0,
    wave: 1,
    lives: 3,
    multiplier: 1,
    hiScore: 0,
    bossHp: 100,
    showBoss: false,
    ammo: 10,
    maxAmmo: 12,
    combo: 0,
    comboTimer: 0,
    activePU: {} as Record<string, number>,
    upgrades: { speed: 0, fireRate: 0, triShot: 0, shield: 0, bomb: 0 } as Record<string, number>,
    announceText: "",
    announceOpacity: 0,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    // Input handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === "Space") { e.preventDefault(); mouseRef.current.down = true; }
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
    
    // Prevent context menu on right click
    const handleContextMenu = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    containerRef.current.addEventListener("mousemove", handleMouseMove);
    containerRef.current.addEventListener("mousedown", handleMouseDown);
    containerRef.current.addEventListener("mouseup", handleMouseUp);
    containerRef.current.addEventListener("contextmenu", handleContextMenu);

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

      const pGfx = new PIXI.Graphics().circle(0, 0, 10).fill({ color: 0xffffff, alpha: 1 });
      const pTex = app.renderer.generateTexture(pGfx);
      const dGfx = new PIXI.Graphics().poly([0, -10, 10, 10, -10, 10]).fill({ color: 0xffffff, alpha: 1 });
      const dTex = app.renderer.generateTexture(dGfx);

      const particleContainer = new PIXI.ParticleContainer({
        texture: pTex,
        dynamicProperties: { position: true, vertex: true, color: true, rotation: false, uvs: false },
        boundsArea: new PIXI.Rectangle(0, 0, W, H)
      });
      const debrisContainer = new PIXI.ParticleContainer({
        texture: dTex,
        dynamicProperties: { position: true, vertex: true, color: true, rotation: true, uvs: false },
        boundsArea: new PIXI.Rectangle(0, 0, W, H)
      });
      fxLayer.addChild(particleContainer, debrisContainer);

      // Stars
      const starsGfx = new PIXI.Graphics();
      bgLayer.addChild(starsGfx);
      const stars: Array<{x: number, y: number, s: number, a: number, tw: number}> = [];
      for (let i = 0; i < 280; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.6 + 0.2, a: Math.random() * 0.8 + 0.2, tw: Math.random() * 200 });
      }

      const drawStars = () => {
        starsGfx.clear();
        for (const s of stars) {
          const alpha = s.a * (0.5 + 0.5 * Math.sin(stateRef.current.frame / s.tw));
          starsGfx.circle(s.x, s.y, s.s).fill({ color: 0xffffff, alpha });
        }
      };

      // Nebula
      const nebulaGfx = new PIXI.Graphics();
      bgLayer.addChildAt(nebulaGfx, 0);
      const drawNebula = () => {
        nebulaGfx.clear();
        const colors = [0x0a001a, 0x000d1a, 0x001a0a];
        for (let i = 0; i < 5; i++) {
          nebulaGfx.ellipse(120 + i * 130, 80 + i * 60, 180, 120).fill({ color: colors[i % 3], alpha: 0.18 });
        }
      };
      drawNebula();

      // Ship Graphics
      const shipGfx = new PIXI.Graphics();
      const engineGfx = new PIXI.Graphics();
      const shieldGfx = new PIXI.Graphics();
      const auraGfx = new PIXI.Graphics();
      gameLayer.addChild(auraGfx, engineGfx, shipGfx, shieldGfx);

      const drawShipGfx = (thrusting: boolean, boosting: boolean) => {
        engineGfx.clear();
        if (thrusting || boosting) {
          const fl = boosting ? 28 : 18;
          engineGfx.poly([-5, 12, -9, fl + Math.random() * 6, 0, fl - 4, 9, fl + Math.random() * 6, 5, 12])
                   .fill({ color: boosting ? 0x00ffff : 0xff6600, alpha: 0.9 });
          engineGfx.poly([-2, 13, -4, fl - 2, 0, fl - 8, 4, fl - 2, 2, 13])
                   .fill({ color: boosting ? 0xffffff : 0xffcc00, alpha: 0.7 });
        }
        
        const pu = stateRef.current.activePU;
        const shipColor = pu.rapid > 0 ? 0xff8800 : pu.trishot > 0 ? 0x00ff88 : 0x00ffcc;
        
        shipGfx.clear();
        shipGfx.poly([0, -18, -12, 14, 0, 8, 12, 14])
               .fill({ color: 0x001a33, alpha: 0.85 })
               .stroke({ width: 1.5, color: shipColor, alpha: 1 });
        
        shipGfx.poly([-5, -2, -8, 10, -4, 6, 4, 6, 8, 10, 5, -2])
               .stroke({ width: 1, color: 0x00aaff, alpha: 0.4 });
        
        shipGfx.ellipse(0, -5, 4, 5)
               .fill({ color: pu.shield > 0 ? 0x00aaff : 0x00ffff, alpha: 0.45 });
        
        shipGfx.moveTo(-12, 14).lineTo(-16, 8).lineTo(-10, 4).stroke({ width: 0.5, color: 0x00ffcc, alpha: 0.3 });
        shipGfx.moveTo(12, 14).lineTo(16, 8).lineTo(10, 4).stroke({ width: 0.5, color: 0x00ffcc, alpha: 0.3 });
      };

      const drawShieldGfx = () => {
        shieldGfx.clear();
        const { invincible } = playerRef.current;
        const activeShield = stateRef.current.activePU.shield;
        if (activeShield > 0 || invincible > 0) {
          const t = activeShield > 0 ? activeShield : invincible;
          const alpha = Math.min(1, t / 40) * (0.5 + 0.3 * Math.sin(stateRef.current.frame * 0.3));
          const col = activeShield > 0 ? 0x00aaff : 0x00ffcc;
          shieldGfx.circle(playerRef.current.x, playerRef.current.y, 24).stroke({ width: 2.5, color: col, alpha });
          shieldGfx.circle(playerRef.current.x, playerRef.current.y, 30).stroke({ width: 1, color: col, alpha: alpha * 0.4 });
        }
      };

      // Entity Makers
      const mkAsteroid = (x: number, y: number, size: number, gen: number, vx?: number, vy?: number): Asteroid => {
        const cols = [0xaa9988, 0x887766, 0x998877, 0x7a8899];
        const col = cols[Math.floor(Math.random() * cols.length)];
        const sides = 7 + Math.floor(Math.random() * 5);
        const pts: number[] = [];
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2;
          const d = size * (0.65 + Math.random() * 0.6);
          pts.push(Math.cos(a) * d, Math.sin(a) * d);
        }
        const spd = vx !== undefined ? Math.sqrt(vx * vx + vy! * vy!) : (1.4 + stateRef.current.wave * 0.25 + Math.random() * 1.2) * (gen ? 1.5 : 1);
        const angle = vx !== undefined ? Math.atan2(vy!, vx) : Math.random() * Math.PI * 2;
        const g = new PIXI.Graphics();
        g.poly(pts).fill({ color: col, alpha: 0.2 }).stroke({ width: 1.5, color: col, alpha: 1 });
        g.circle(-size * 0.2, -size * 0.1, size * 0.18).stroke({ width: 0.7, color: col, alpha: 0.35 });
        g.circle(size * 0.15, size * 0.2, size * 0.12).stroke({ width: 0.7, color: col, alpha: 0.25 });
        g.x = x; g.y = y;
        gameLayer.addChild(g);
        const hp = gen === 0 ? 1 : gen === 1 ? 2 : 1;
        return { x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, rot: 0, av: (Math.random() - 0.5) * 0.045, r: size, size, gen, col, gfx: g, hp };
      };

      const mkEnemy = (type: "scout" | "gunship"): Enemy => {
        const side = Math.floor(Math.random() * 4);
        let x = W / 2, y = H / 2;
        if (side === 0) { x = Math.random() * W; y = -30; }
        else if (side === 1) { x = W + 30; y = Math.random() * H; }
        else if (side === 2) { x = Math.random() * W; y = H + 30; }
        else { x = -30; y = Math.random() * H; }
        const g = new PIXI.Graphics();
        if (type === 'scout') {
          g.poly([0, -14, 10, 10, 0, 4, -10, 10]).fill({ color: 0x1a0000, alpha: 0.8 }).stroke({ width: 1.5, color: 0xff4444, alpha: 1 });
          g.circle(0, -2, 4).stroke({ width: 0.8, color: 0xff8888, alpha: 0.5 });
          g.circle(0, -2, 3).fill({ color: 0xff2200, alpha: 0.7 });
        } else {
          g.poly([0, -18, 14, 12, 6, 6, -6, 6, -14, 12]).fill({ color: 0x1a0800, alpha: 0.8 }).stroke({ width: 2, color: 0xff8800, alpha: 1 });
          g.poly([-8, 6, -12, 0, -8, -8, 8, -8, 12, 0, 8, 6]).stroke({ width: 1, color: 0xffaa00, alpha: 0.5 });
          g.circle(0, 0, 5).fill({ color: 0xff6600, alpha: 0.8 });
        }
        g.x = x; g.y = y; gameLayer.addChild(g);
        return { x, y, vx: 0, vy: 0, rot: 0, av: 0, r: type === 'scout' ? 13 : 18, type, gfx: g, hp: type === 'scout' ? 2 : 5, shootTimer: 0 };
      };

      const drawBossGfx = (g: PIXI.Graphics, hp: number, maxHp: number) => {
        g.clear();
        const r = hp / maxHp;
        const c = r > 0.6 ? 0xff3333 : r > 0.3 ? 0xff7700 : 0xff0000;
        g.poly([0, -58, -28, -25, -55, 18, -32, 52, 0, 35, 32, 52, 55, 18, 28, -25]).fill({ color: 0x1a0000, alpha: 0.85 }).stroke({ width: 2, color: c, alpha: 1 });
        g.poly([-14, -28, -30, -8, -22, 22, 0, 14, 22, 22, 30, -8, 14, -28]).stroke({ width: 1.5, color: 0xff8800, alpha: 0.8 });
        g.circle(0, 0, 12).fill({ color: 0xff0000, alpha: 0.95 });
        [-24, 24].forEach(ox => g.circle(ox, -10, 6).fill({ color: 0xff8800, alpha: 0.5 }));
        g.circle(0, 0, 40).stroke({ width: 1, color: 0xff4444, alpha: 0.5 });
        if (r < 0.5) g.circle(0, 0, 52).stroke({ width: 1, color: 0xff0000, alpha: 0.3 });
      };

      const mkBoss = (w: number): Boss => {
        const hp = 20 + w * 10;
        const g = new PIXI.Graphics();
        drawBossGfx(g, hp, hp);
        g.x = W / 2; g.y = 80; gameLayer.addChild(g);
        return { x: W / 2, y: 80, vx: 1.5, vy: 0.5, rot: 0, av: 0.006, r: 58, gfx: g, hp, maxHp: hp, shootTimer: 0, teleTimer: 300, shieldTimer: 0, wave: w };
      };

      const mkBullet = (x: number, y: number, vx: number, vy: number, fromEnemy: boolean, color = 0x00ffff, r = 4): Bullet => {
        const g = new PIXI.Graphics();
        g.circle(0, 0, r).fill({ color, alpha: 1 });
        g.circle(0, 0, r * 0.45).fill({ color: 0xffffff, alpha: 0.6 });
        g.x = x; g.y = y; gameLayer.addChild(g);
        return { x, y, vx, vy, rot: 0, av: 0, r, gfx: g, life: 100, maxLife: 100, fromEnemy, color };
      };

      const mkPowerup = (x: number, y: number): Powerup => {
        const pu = PU_TYPES[Math.floor(Math.random() * PU_TYPES.length)];
        const container = new PIXI.Container();
        const g = new PIXI.Graphics();
        g.circle(0, 0, 13).fill({ color: pu.color, alpha: 0.25 }).stroke({ width: 1.5, color: pu.color, alpha: 1 });
        g.circle(0, 0, 18).stroke({ width: 0.5, color: pu.color, alpha: 0.5 });
        const txt = new PIXI.Text({ text: pu.text, style: { fontSize: 8, fill: pu.color, align: 'center', fontFamily: 'Courier New' } });
        txt.anchor.set(0.5); 
        container.addChild(g, txt);
        container.x = x; container.y = y; gameLayer.addChild(container);
        return { x, y, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, rot: 0, av: 0.02, r: 14, gfx: container, pu, life: 400 };
      };

      const spawnFX = (x: number, y: number, n: number, col: number, spd: number, size = 3, life = 45) => {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, s = spd * (0.4 + Math.random() * 0.9);
          const baseScale = (size * (0.4 + Math.random() * 0.8)) / 10;
          const ml = life + Math.random() * 20;
          const p = new PIXI.Particle({
            texture: pTex,
            x, y,
            tint: col,
            alpha: 0.95,
            scaleX: baseScale,
            scaleY: baseScale,
            anchorX: 0.5,
            anchorY: 0.5
          }) as any;
          p.vx = Math.cos(a) * s;
          p.vy = Math.sin(a) * s;
          p.life = ml;
          p.maxLife = ml;
          p.baseScale = baseScale;
          particleContainer.addParticle(p);
        }
      };

      const spawnDebris = (x: number, y: number, col: number) => {
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2.5;
          const sz = 4 + Math.random() * 6;
          const baseScale = sz / 20;
          const ml = 80 + Math.random() * 40;
          const d = new PIXI.Particle({
            texture: dTex,
            x, y,
            tint: col,
            alpha: 0.8,
            scaleX: baseScale,
            scaleY: baseScale,
            anchorX: 0.5,
            anchorY: 0.5,
            rotation: Math.random() * Math.PI
          }) as any;
          d.vx = Math.cos(a) * s;
          d.vy = Math.sin(a) * s;
          d.av = (Math.random() - 0.5) * 0.06;
          d.life = ml;
          d.maxLife = ml;
          d.baseScale = baseScale;
          debrisContainer.addParticle(d);
        }
      };

      const announceWave = (txt: string) => {
        stateRef.current.announceText = txt;
        stateRef.current.announceOpacity = 1;
        stateRef.current.announceTimer = 80;
      };

      const spawnWave = (w: number) => {
        const count = 4 + w * 2;
        const margin = 130;
        for (let i = 0; i < count; i++) {
          let x, y;
          do { x = Math.random() * W; y = Math.random() * H; }
          while (Physics.dist({ x, y }, playerRef.current) < margin);
          asteroidsRef.current.push(mkAsteroid(x, y, 30 + Math.random() * 16, 0));
        }
        if (w % 3 === 0) bossRef.current = mkBoss(w);
        if (w > 2) {
          const eCount = Math.floor(w / 2);
          for (let i = 0; i < eCount; i++) enemiesRef.current.push(mkEnemy(w > 5 ? 'gunship' : 'scout'));
        }
        announceWave(`WAVE ${w}`);
      };

      const fire = () => {
        const state = stateRef.current;
        const player = playerRef.current;
        if (state.ammo <= 0 || state.shootCooldown > 0) return;
        const rate = state.upgrades.fireRate + (state.activePU.rapid > 0 ? 2 : 0);
        state.shootCooldown = Math.max(6, 14 - rate * 2);
        state.ammo = Math.max(0, state.ammo - 1);
        const spd = 11;
        const bx = player.x + Math.sin(player.rot) * 20, by = player.y - Math.cos(player.rot) * 20;
        const col = state.activePU.rapid > 0 ? 0xff8800 : state.activePU.trishot > 0 ? 0x00ff88 : 0x00ffff;
        bulletsRef.current.push(mkBullet(bx, by, Math.sin(player.rot) * spd, -Math.cos(player.rot) * spd, false, col));
        if (state.activePU.trishot > 0 || state.upgrades.triShot > 0) {
          const spread = 0.22;
          [-spread, spread].forEach(off => {
            const a = player.rot + off;
            bulletsRef.current.push(mkBullet(bx, by, Math.sin(a) * spd, -Math.cos(a) * spd, false, col, 3));
          });
        }
        spawnFX(bx, by, 4, col, 1.5, 2);
      };

      const smartBomb = () => {
        const state = stateRef.current;
        const player = playerRef.current;
        spawnFX(player.x, player.y, 60, 0xff3333, 5, 4, 60);
        spawnFX(player.x, player.y, 40, 0xffffff, 4, 2, 40);
        for (let i = asteroidsRef.current.length - 1; i >= 0; i--) {
          if (Physics.dist(asteroidsRef.current[i], player) < 200) { explodeAsteroid(asteroidsRef.current[i]); asteroidsRef.current.splice(i, 1); }
        }
        for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
          if (Physics.dist(enemiesRef.current[i], player) < 200) { destroyEnemy(enemiesRef.current[i]); enemiesRef.current.splice(i, 1); }
        }
      };

      const explodeAsteroid = (a: Asteroid) => {
        spawnFX(a.x, a.y, 12, a.col, 2.8, 3.5);
        spawnDebris(a.x, a.y, a.col);
        if (a.size > 15 && a.gen < 2) {
          const ns = a.size * 0.52;
          for (let i = 0; i < 2; i++) asteroidsRef.current.push(mkAsteroid(a.x, a.y, ns, a.gen + 1, a.vx + (Math.random() - 0.5) * 2, a.vy + (Math.random() - 0.5) * 2));
        }
        if (Math.random() < 0.12) powerupsRef.current.push(mkPowerup(a.x, a.y));
        addScore((a.gen === 0 ? 120 : a.gen === 1 ? 60 : 30) * stateRef.current.multiplier);
        incCombo();
        if (a.gfx) gameLayer.removeChild(a.gfx);
      };

      const destroyEnemy = (e: Enemy) => {
        spawnFX(e.x, e.y, 20, 0xff4400, 3.5, 4);
        spawnDebris(e.x, e.y, 0xff8800);
        if (Math.random() < 0.3) powerupsRef.current.push(mkPowerup(e.x, e.y));
        addScore((e.type === 'scout' ? 250 : 500) * stateRef.current.multiplier);
        incCombo();
        if (e.gfx) gameLayer.removeChild(e.gfx);
      };

      const addScore = (pts: number) => {
        stateRef.current.score += pts;
        if (stateRef.current.score > stateRef.current.hiScore) stateRef.current.hiScore = stateRef.current.score;
      };

      const incCombo = () => {
        stateRef.current.combo++;
        stateRef.current.comboTimer = 120;
        stateRef.current.multiplier = Math.min(8, 1 + Math.floor(stateRef.current.combo / 5));
      };

      const collectPU = (pu: Powerup) => {
        const state = stateRef.current;
        spawnFX(pu.x, pu.y, 15, pu.pu.color, 2.5);
        switch (pu.pu.id) {
          case 'shield': state.activePU.shield = 420; break;
          case 'rapid': state.activePU.rapid = 300; break;
          case 'trishot': state.activePU.trishot = 300; break;
          case 'slow': state.activePU.slow = 300; break;
          case 'bomb': smartBomb(); break;
          case 'life': state.lives = Math.min(5, state.lives + 1); break;
          case 'magnet': state.activePU.magnet = 300; break;
        }
      };

      const loseLife = () => {
        const player = playerRef.current;
        const state = stateRef.current;
        if (player.invincible > 0 || state.activePU.shield > 0) return;
        state.lives--;
        player.invincible = 180;
        spawnFX(player.x, player.y, 25, 0x00ffcc, 3.5);
        state.combo = 0; state.comboTimer = 0; state.multiplier = 1;
        if (state.lives <= 0) {
          state.state = 'gameover';
          spawnFX(player.x, player.y, 60, 0xff3300, 5, 5);
        }
      };

      // Expose to window for UI buttons
      (window as any).startGame = () => {
        const state = stateRef.current;
        state.score = 0; state.lives = 3; state.wave = 1; state.combo = 0; state.comboTimer = 0; state.multiplier = 1;
        state.ammo = state.maxAmmo = 12; state.ammoRegen = 0;
        state.activePU = { shield: 0, rapid: 0, trishot: 0, slow: 0, magnet: 0 };
        state.upgrades = { speed: 0, fireRate: 0, triShot: 0, shield: 0, bomb: 0 };
        [asteroidsRef.current, bulletsRef.current, powerupsRef.current, enemiesRef.current].forEach(arr => {
          arr.forEach(o => { if (o.gfx && o.gfx.parent) o.gfx.parent.removeChild(o.gfx); });
          arr.length = 0;
        });
        particleContainer.particleChildren.length = 0; particleContainer.update();
        debrisContainer.particleChildren.length = 0; debrisContainer.update();
        if (bossRef.current && bossRef.current.gfx) { gameLayer.removeChild(bossRef.current.gfx); bossRef.current = null; }
        Object.assign(playerRef.current, { x: W / 2, y: H / 2, vx: 0, vy: 0, rot: 0, invincible: 180, boost: 0, boostCooldown: 0 });
        spawnWave(1);
        state.state = 'playing';
      };

      (window as any).startNextWave = () => {
        const state = stateRef.current;
        asteroidsRef.current.forEach(a => { if (a.gfx?.parent) gameLayer.removeChild(a.gfx); });
        bulletsRef.current.forEach(b => { if (b.gfx?.parent) gameLayer.removeChild(b.gfx); });
        asteroidsRef.current = []; bulletsRef.current = [];
        if (bossRef.current && bossRef.current.gfx) { gameLayer.removeChild(bossRef.current.gfx); bossRef.current = null; }
        state.wave++;
        playerRef.current.invincible = 120;
        state.ammo = state.maxAmmo = Math.min(12 + state.upgrades.fireRate, 16);
        spawnWave(state.wave);
        state.state = 'playing';
      };
      
      (window as any).buyUpgrade = (key: string, cost: number) => {
        if (stateRef.current.score >= cost) {
           stateRef.current.score -= cost;
           stateRef.current.upgrades[key]++;
        }
      };

      const drawMinimap = () => {
        if (!mmCanvasRef.current) return;
        const ctx = mmCanvasRef.current.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, 80, 50);
        ctx.fillStyle = 'rgba(0,10,20,.6)'; ctx.fillRect(0, 0, 80, 50);
        const sx = 80 / W, sy = 50 / H;
        ctx.fillStyle = '#886655';
        for (const a of asteroidsRef.current) { ctx.fillRect(a.x * sx - 1, a.y * sy - 1, 2.5, 2.5); }
        ctx.fillStyle = '#ff4444';
        for (const e of enemiesRef.current) { ctx.fillRect(e.x * sx - 1.5, e.y * sy - 1.5, 3, 3); }
        if (bossRef.current) { ctx.fillStyle = '#ff0000'; ctx.fillRect(bossRef.current.x * sx - 3, bossRef.current.y * sy - 3, 6, 6); }
        for (const p of powerupsRef.current) {
          ctx.fillStyle = '#' + p.pu.color.toString(16).padStart(6, '0');
          ctx.fillRect(p.x * sx - 1.5, p.y * sy - 1.5, 3, 3);
        }
        ctx.fillStyle = '#00ffcc'; ctx.beginPath(); ctx.arc(playerRef.current.x * sx, playerRef.current.y * sy, 3, 0, Math.PI * 2); ctx.fill();
      };

      // Game Loop
      app.ticker.add(() => {
        if (stateRef.current.state !== "playing") {
          drawStars();
          return;
        }

        const state = stateRef.current;
        const player = playerRef.current;
        state.frame++;
        const slow = state.activePU.slow > 0 ? 0.5 : 1;

        // Player movement
        const spd = 0.2 + state.upgrades.speed * 0.05;
        const fric = 0.982;
        let thrusting = false, boosting = false;

        if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) player.rot -= 0.07;
        if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) player.rot += 0.07;
        if (keysRef.current['ArrowUp'] || keysRef.current['KeyW']) {
          const t = Physics.thrust(player.rot, spd); player.vx += t.vx; player.vy += t.vy; thrusting = true;
        }
        if (keysRef.current['ArrowDown'] || keysRef.current['KeyS']) {
          const t = Physics.thrust(player.rot + Math.PI, spd * 0.6); player.vx += t.vx; player.vy += t.vy;
        }
        if ((keysRef.current['ShiftLeft'] || keysRef.current['ShiftRight']) && player.boostCooldown === 0) {
          const t = Physics.thrust(player.rot, 0.45); player.vx += t.vx; player.vy += t.vy;
          player.boost = 12; player.boostCooldown = 90; boosting = true;
          spawnFX(player.x, player.y, 6, 0x00ffff, 2, 2, 20);
        }
        if (player.boostCooldown > 0) player.boostCooldown--;
        if (player.boost > 0) { player.boost--; boosting = true; }
        if (keysRef.current['BracketLeft']) { const t = Physics.thrust(player.rot - Math.PI / 2, spd * 0.7); player.vx += t.vx; player.vy += t.vy; }
        if (keysRef.current['BracketRight']) { const t = Physics.thrust(player.rot + Math.PI / 2, spd * 0.7); player.vx += t.vx; player.vy += t.vy; }
        if (keysRef.current['KeyB']) { keysRef.current['KeyB'] = false; smartBomb(); } // Bomb shortcut (one fire per press)

        Physics.clampSpeed(player, boosting ? 9 : 5.5 + state.upgrades.speed * 0.5);
        player.vx *= fric; player.vy *= fric;
        player.x += player.vx * slow; player.y += player.vy * slow;
        Physics.wrap(player, W, H);
        if (player.invincible > 0) player.invincible--;

        // Shoot
        if (state.shootCooldown > 0) state.shootCooldown--;
        if (mouseRef.current.down && state.shootCooldown === 0) fire();
        if (state.activePU.rapid > 0) { state.autoFireTimer++; if (state.autoFireTimer > 4) { state.autoFireTimer = 0; fire(); } }
        else state.autoFireTimer = 0;

        // Ammo regen
        state.ammoRegen++;
        if (state.ammoRegen > 70 - state.upgrades.fireRate * 8 && state.ammo < state.maxAmmo) { state.ammo++; state.ammoRegen = 0; }

        // Passive shield
        if (state.upgrades.shield > 0 && state.activePU.shield < 50 && state.frame % 120 === 0) state.activePU.shield = Math.min(600, state.activePU.shield + 100);

        // Decay PU
        for (const k of Object.keys(state.activePU)) {
          if (state.activePU[k] > 0) {
            state.activePU[k] -= slow;
            if (state.activePU[k] <= 0) state.activePU[k] = 0;
          }
        }

        // Combo decay
        if (state.comboTimer > 0) {
          state.comboTimer--;
          if (state.comboTimer === 0) { state.combo = 0; state.multiplier = 1; }
        }

        if (state.announceTimer > 0) {
          state.announceTimer--;
          if (state.announceTimer === 0) state.announceOpacity = 0;
        }

        // Draw Player
        drawShipGfx(thrusting, boosting);
        shipGfx.x = engineGfx.x = auraGfx.x = player.x;
        shipGfx.y = engineGfx.y = auraGfx.y = player.y;
        shipGfx.rotation = engineGfx.rotation = player.rot;
        shipGfx.alpha = player.invincible > 0 ? (Math.sin(state.frame * 0.4) > 0 ? 0.9 : 0.2) : 1;
        drawShieldGfx();

        auraGfx.clear();
        if (state.activePU.magnet > 0) {
          auraGfx.circle(0, 0, 90).stroke({ width: 1, color: 0xffff00, alpha: 0.2 + 0.1 * Math.sin(state.frame * 0.1) });
        }

        // Bullets
        const boss = bossRef.current;
        Physics.integrate(bulletsRef.current, slow);
        for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
          const b = bulletsRef.current[i]; b.life--;
          if (b.gfx) { b.gfx.x = b.x; b.gfx.y = b.y; b.gfx.alpha = Math.min(1, b.life / 12); }
          const off = b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30;
          if (b.life <= 0 || off) { if (b.gfx) gameLayer.removeChild(b.gfx); bulletsRef.current.splice(i, 1); continue; }
          
          if (!b.fromEnemy) {
            let hit = false;
            for (let j = asteroidsRef.current.length - 1; j >= 0; j--) {
              if (Physics.hit(b, asteroidsRef.current[j])) {
                asteroidsRef.current[j].hp--; spawnFX(b.x, b.y, 4, b.color, 1.5, 2);
                if (asteroidsRef.current[j].hp <= 0) { explodeAsteroid(asteroidsRef.current[j]); asteroidsRef.current.splice(j, 1); }
                if (b.gfx) gameLayer.removeChild(b.gfx); bulletsRef.current.splice(i, 1); hit = true; break;
              }
            }
            if (hit) continue;
            for (let j = enemiesRef.current.length - 1; j >= 0; j--) {
              if (Physics.hit(b, enemiesRef.current[j])) {
                enemiesRef.current[j].hp--; spawnFX(b.x, b.y, 5, 0xff4400, 2);
                if (enemiesRef.current[j].hp <= 0) { destroyEnemy(enemiesRef.current[j]); enemiesRef.current.splice(j, 1); }
                if (b.gfx) gameLayer.removeChild(b.gfx); bulletsRef.current.splice(i, 1); hit = true; break;
              }
            }
            if (hit) continue;
            if (boss && Physics.hit(b, boss)) {
              if (boss.shieldTimer > 0) { spawnFX(b.x, b.y, 3, 0x0044ff, 1.5); }
              else {
                boss.hp--;
                drawBossGfx(boss.gfx as PIXI.Graphics, boss.hp, boss.maxHp);
                spawnFX(b.x, b.y, 6, 0xff4444, 2);
                addScore(15 * state.multiplier);
                if (boss.hp <= 0) {
                  spawnFX(boss.x, boss.y, 80, 0xff4400, 5, 5);
                  spawnFX(boss.x, boss.y, 50, 0xffcc00, 4, 3);
                  spawnDebris(boss.x, boss.y, 0xff8800);
                  for (let k = 0; k < 4; k++) powerupsRef.current.push(mkPowerup(boss.x + (Math.random() - 0.5) * 80, boss.y + (Math.random() - 0.5) * 80));
                  addScore(3000 * state.multiplier);
                  if (boss.gfx) gameLayer.removeChild(boss.gfx); bossRef.current = null;
                }
              }
              if (b.gfx) gameLayer.removeChild(b.gfx); bulletsRef.current.splice(i, 1);
            }
          } else {
            if (Physics.hit(b, player)) { loseLife(); if (b.gfx) gameLayer.removeChild(b.gfx); bulletsRef.current.splice(i, 1); }
          }
        }

        // Asteroids
        Physics.integrate(asteroidsRef.current, slow);
        for (const a of asteroidsRef.current) {
          Physics.wrap(a, W, H); if (a.gfx) { a.gfx.x = a.x; a.gfx.y = a.y; a.gfx.rotation = a.rot; }
          if (Physics.hit(a, player)) loseLife();
        }

        // Enemies AI
        Physics.integrate(enemiesRef.current, slow);
        for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
          const e = enemiesRef.current[i];
          Physics.wrap(e, W, H);
          const ang = Physics.angleTo(e, player);
          const chaseSpd = e.type === 'scout' ? 1.8 : 1.2;
          e.vx += (Math.cos(ang) * chaseSpd - e.vx) * 0.04;
          e.vy += (Math.sin(ang) * chaseSpd - e.vy) * 0.04;
          e.rot = ang + Math.PI / 2;
          if (e.gfx) { e.gfx.x = e.x; e.gfx.y = e.y; e.gfx.rotation = e.rot; }
          e.shootTimer++;
          const interval = e.type === 'scout' ? 90 : 60;
          if (e.shootTimer >= interval) {
            e.shootTimer = 0;
            const spd = e.type === 'scout' ? 4 : 3;
            bulletsRef.current.push(mkBullet(e.x, e.y, Math.cos(ang) * spd, Math.sin(ang) * spd, true, 0xff3300, 4.5));
            if (e.type === 'gunship') {
              [-0.2, 0.2].forEach(off => { bulletsRef.current.push(mkBullet(e.x, e.y, Math.cos(ang + off) * spd, Math.sin(ang + off) * spd, true, 0xff6600, 3.5)); });
            }
          }
          if (Physics.hit(e, player)) loseLife();
        }

        // Boss AI
        if (boss) {
          boss.x += boss.vx * slow; boss.y += boss.vy * slow; boss.rot += boss.av * slow;
          if (boss.x < 70 || boss.x > W - 70) boss.vx *= -1;
          if (boss.y < 60 || boss.y > H * 0.45) boss.vy *= -1;
          if (boss.gfx) { boss.gfx.x = boss.x; boss.gfx.y = boss.y; boss.gfx.rotation = boss.rot; }
          boss.shootTimer += slow;
          const phase = boss.hp / boss.maxHp;
          const interval = Math.max(20, 60 - state.wave * 4);
          if (boss.shootTimer >= interval) {
            boss.shootTimer = 0;
            const spread = phase < 0.4 ? 7 : phase < 0.7 ? 5 : 3;
            for (let i = 0; i < spread; i++) {
              const a = Physics.angleTo(boss, player) + (i - (spread - 1) / 2) * (0.2 + (1 - phase) * 0.15);
              const bspd = 2.8 + state.wave * 0.35;
              const bx = boss.x + Math.cos(a) * 65, by = boss.y + Math.sin(a) * 65;
              bulletsRef.current.push(mkBullet(bx, by, Math.cos(a) * bspd, Math.sin(a) * bspd, true, 0xff2200, 5));
            }
            if (phase < 0.5 && Math.random() < 0.05) enemiesRef.current.push(mkEnemy('scout'));
          }
          if (phase < 0.4) {
            boss.teleTimer -= slow;
            if (boss.teleTimer <= 0) {
              boss.teleTimer = 300;
              boss.x = Math.random() * (W - 200) + 100; boss.y = Math.random() * (H * 0.35) + 60;
              spawnFX(boss.x, boss.y, 20, 0xff0000, 3);
            }
          }
          boss.shieldTimer = Math.max(0, boss.shieldTimer - slow);
          if (Physics.hit(boss, player)) loseLife();
        }

        // Power-ups
        Physics.integrate(powerupsRef.current, slow);
        for (let i = powerupsRef.current.length - 1; i >= 0; i--) {
          const p = powerupsRef.current[i];
          Physics.wrap(p, W, H);
          if (p.gfx) { p.gfx.x = p.x; p.gfx.y = p.y; p.gfx.rotation = p.rot; p.gfx.alpha = p.life < 60 ? p.life / 60 : 1; }
          p.life--;
          if (state.activePU.magnet > 0 && Physics.dist(p, player) < 90) {
            const a = Physics.angleTo(p, player); p.vx += Math.cos(a) * 0.5; p.vy += Math.sin(a) * 0.5;
          }
          if (Physics.hit(p, player, 8)) { collectPU(p); if (p.gfx) gameLayer.removeChild(p.gfx); powerupsRef.current.splice(i, 1); continue; }
          if (p.life <= 0) { if (p.gfx) gameLayer.removeChild(p.gfx); powerupsRef.current.splice(i, 1); }
        }

        // Particles
        for (let i = particleContainer.particleChildren.length - 1; i >= 0; i--) {
          const p = particleContainer.particleChildren[i] as any;
          p.x += p.vx;
          p.y += p.vy;
          p.life--;
          const lifeRatio = Math.max(0, p.life / p.maxLife);
          p.alpha = lifeRatio;
          p.scaleX = p.scaleY = p.baseScale * lifeRatio;
          if (p.life <= 0) particleContainer.removeParticleAt(i);
        }

        // Debris
        for (let i = debrisContainer.particleChildren.length - 1; i >= 0; i--) {
          const d = debrisContainer.particleChildren[i] as any;
          d.x += d.vx; d.y += d.vy; d.vx *= 0.97; d.vy *= 0.97; d.rotation += d.av;
          d.life--;
          const lifeRatio = Math.max(0, d.life / d.maxLife);
          d.alpha = lifeRatio * 0.8;
          if (d.life <= 0) debrisContainer.removeParticleAt(i);
        }

        // Wave logic
        if (asteroidsRef.current.length === 0 && enemiesRef.current.length === 0 && !boss && state.nextWaveTimer < 0 && state.state === 'playing') {
          state.nextWaveTimer = 90;
        }
        if (state.nextWaveTimer > 0) {
          state.nextWaveTimer--;
          if (state.nextWaveTimer === 0) {
            state.nextWaveTimer = -1;
            if (state.wave >= 8) {
              state.state = 'win';
            } else {
              state.state = 'upgrade';
            }
          }
        }

        // Update HUD safely (throttled for performance)
        if (state.frame % 5 === 0) {
          setHud({
            state: state.state,
            score: state.score,
            wave: state.wave,
            lives: state.lives,
            multiplier: state.multiplier,
            hiScore: state.hiScore,
            bossHp: boss ? boss.hp : 0,
            showBoss: !!boss,
            ammo: state.ammo,
            maxAmmo: state.maxAmmo,
            combo: state.combo,
            comboTimer: state.comboTimer,
            activePU: { ...state.activePU },
            upgrades: { ...state.upgrades },
            announceText: state.announceText,
            announceOpacity: state.announceOpacity,
          });
        }

        drawStars();
        drawMinimap();
      });
    };

    initPixi();

    return () => {
      isCancelled = true;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      containerRef.current?.removeEventListener("mousemove", handleMouseMove);
      containerRef.current?.removeEventListener("mousedown", handleMouseDown);
      containerRef.current?.removeEventListener("mouseup", handleMouseUp);
      containerRef.current?.removeEventListener("contextmenu", handleContextMenu);
      if (appRef.current) {
        appRef.current.ticker.stop();
        appRef.current.destroy({ removeView: true, releaseGlobalResources: true }, { children: true, texture: true, textureSource: true });
        appRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full max-w-[820px] mx-auto select-none">
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
            <div className="text-sm tracking-widest pt-0.5 text-[#ff4444]">{"♥ ".repeat(Math.max(0, hud.lives)) || "✕"}</div>
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

      {/* Combo Display */}
      {hud.combo > 4 && (
        <div className="absolute top-[70px] left-1/2 -translate-x-1/2 text-[#ffcc00] text-sm tracking-widest text-shadow-glow pointer-events-none transition-opacity" style={{ opacity: hud.comboTimer / 40 }}>
          COMBO x{hud.combo}!
        </div>
      )}

      {/* Boss health bar */}
      {hud.showBoss && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[220px] flex flex-col items-center gap-1 pointer-events-none">
          <div className="text-[#ff4444] text-[9px] tracking-[3px] font-bold">BOSS DETECTED</div>
          <Progress value={(hud.bossHp / (20 + hud.wave * 10)) * 100} className="h-2 w-full bg-[#1a0000] border border-[#ff444455] [&>div]:bg-gradient-to-r [&>div]:from-[#ff0000] [&>div]:to-[#ff6600]" />
        </div>
      )}

      {/* Wave Announcement */}
      {hud.announceOpacity > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[28px] font-bold text-[#00ffcc] tracking-[4px] pointer-events-none text-shadow-glow transition-opacity duration-500" style={{ opacity: hud.announceOpacity }}>
          {hud.announceText}
        </div>
      )}

      {/* Powerup display */}
      <div className="absolute bottom-[50px] right-4 flex flex-col gap-1 items-end pointer-events-none">
        {Object.entries(hud.activePU).map(([k, v]) => {
          if (v <= 0) return null;
          const puInfo = PU_TYPES.find(p => p.id === k);
          if (!puInfo) return null;
          const pct = Math.round((v / 300) * 100);
          const colorHex = '#' + puInfo.color.toString(16).padStart(6, '0');
          return (
            <div key={k} className="px-[10px] py-[4px] rounded-full text-[10px] tracking-[1px] font-mono border" style={{ color: colorHex, borderColor: colorHex + '55', backgroundColor: colorHex + '15' }}>
              {puInfo.label} {pct}%
            </div>
          );
        })}
      </div>

      {/* Ammo Bar */}
      <div className="absolute bottom-3 left-3 flex items-center gap-[3px] pointer-events-none">
        <span className="text-[#ff9900] text-[9px] tracking-[2px] opacity-60 mr-1">PWR</span>
        {Array.from({ length: hud.maxAmmo }).map((_, i) => (
          <div key={i} className={`w-[7px] h-[13px] rounded-[2px] ${i < hud.ammo ? 'bg-[#ff9900] shadow-[0_0_5px_#ff990066]' : 'bg-[#1a1a1a]'}`} />
        ))}
      </div>

      {/* Minimap */}
      <div className="absolute bottom-3 right-3 w-20 h-12 bg-[#000a14]/80 border border-[#00ffcc33] rounded-[6px] overflow-hidden pointer-events-none">
        <canvas ref={mmCanvasRef} width={80} height={50} className="w-full h-full block" />
      </div>

      {/* Screen Messages (Start, Game Over, Upgrades) */}
      {hud.state !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#00000c]/90 backdrop-blur-sm rounded-xl pointer-events-auto z-50">
          
          {hud.state === "menu" && (
            <Card className="w-full max-w-md bg-transparent border-none shadow-none text-white flex flex-col items-center">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-3xl font-bold tracking-[3px] text-[#00ffcc] text-shadow-glow">ASTEROID BLASTER</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4 pt-0">
                <p className="text-xs text-center text-[#aaa] tracking-[1px] leading-loose">
                  Survive all waves • Collect power-ups • Defeat bosses<br />
                  <span className="text-[#00ffcc] opacity-80">WASD/Arrows</span> = move • <span className="text-[#00ffcc] opacity-80">Mouse aim</span> • <span className="text-[#00ffcc] opacity-80">Click/Space</span> = fire<br />
                  <span className="text-[#00ffcc] opacity-80">Shift</span> = boost • <span className="text-[#00ffcc] opacity-80">[ ]</span> = strafe • <span className="text-[#00ffcc] opacity-80">B</span> = smart bomb
                </p>
                <div className="text-[11px] text-[#ffcc0099] tracking-[1px]">HI-SCORE: {hud.hiScore}</div>
                <Button 
                  variant="outline"
                  className="mt-2 py-[22px] px-8 bg-transparent border-[1.5px] border-[#00ffcc] text-[#00ffcc] font-mono text-[13px] tracking-[2px] hover:bg-[#00ffcc22] hover:text-[#00ffcc] transition-all"
                  onClick={() => (window as any).startGame?.()}
                >START GAME</Button>
              </CardContent>
            </Card>
          )}

          {hud.state === "gameover" && (
             <Card className="w-full max-w-md bg-transparent border-none shadow-none text-white flex flex-col items-center">
               <CardHeader className="text-center pb-2">
                 <CardTitle className="text-3xl font-bold tracking-[3px] text-[#00ffcc] text-shadow-glow">GAME OVER</CardTitle>
               </CardHeader>
               <CardContent className="flex flex-col items-center gap-4 pt-0">
                 <p className="text-xs text-center text-[#aaa] tracking-[1px] leading-loose">
                   Final Score: <span className="text-[#00ffcc] font-bold">{hud.score}</span><br />
                   Wave {hud.wave} • Hi-Score: {hud.hiScore}
                 </p>
                 <Button 
                   variant="outline"
                   className="mt-2 py-[22px] px-8 bg-transparent border-[1.5px] border-[#00ffcc] text-[#00ffcc] font-mono text-[13px] tracking-[2px] hover:bg-[#00ffcc22] hover:text-[#00ffcc] transition-all"
                   onClick={() => (window as any).startGame?.()}
                 >PLAY AGAIN</Button>
               </CardContent>
             </Card>
          )}

          {hud.state === "win" && (
             <Card className="w-full max-w-md bg-transparent border-none shadow-none text-white flex flex-col items-center">
               <CardHeader className="text-center pb-2">
                 <CardTitle className="text-3xl font-bold tracking-[3px] text-[#00ffcc] text-shadow-glow">VICTORY!</CardTitle>
               </CardHeader>
               <CardContent className="flex flex-col items-center gap-4 pt-0">
                 <p className="text-xs text-center text-[#aaa] tracking-[1px] leading-loose">
                   All 8 waves cleared!<br />
                   Final Score: <span className="text-[#00ffcc] font-bold">{hud.score}</span>
                 </p>
                 <Button 
                   variant="outline"
                   className="mt-2 py-[22px] px-8 bg-transparent border-[1.5px] border-[#00ffcc] text-[#00ffcc] font-mono text-[13px] tracking-[2px] hover:bg-[#00ffcc22] hover:text-[#00ffcc] transition-all"
                   onClick={() => (window as any).startGame?.()}
                 >PLAY AGAIN</Button>
               </CardContent>
             </Card>
          )}

          {hud.state === "upgrade" && (
            <Card className="w-full max-w-[340px] bg-transparent border-none shadow-none text-white flex flex-col items-center">
               <CardHeader className="text-center pb-2 w-full">
                 <CardTitle className="text-2xl font-bold tracking-[2px] text-[#00ffcc] text-shadow-glow">WAVE {hud.wave} CLEARED</CardTitle>
               </CardHeader>
               <CardContent className="flex flex-col items-center gap-3 pt-0 w-full">
                 <p className="text-xs text-center text-[#aaa] tracking-[1px]">
                   Score: <span className="text-[#00ffcc] font-bold">{hud.score}</span><br />
                   {(hud.wave + 1) % 3 === 0 ? <span className="text-[#ff4444] font-bold tracking-[1px]">⚠ BOSS APPROACHING</span> : "Prepare for the next wave"}
                 </p>
                 
                 <div className="w-full flex flex-col gap-2 mt-2">
                   <div className="text-[9px] text-[#00ffcc88] tracking-[2px] text-center font-mono">SPEND SCORE TO UPGRADE</div>
                   {UPG_DEFS.map(u => {
                     const cur = hud.upgrades[u.key];
                     if (cur >= u.max) return null;
                     const cost = u.cost * (cur + 1);
                     const canAfford = hud.score >= cost;
                     return (
                       <div key={u.key} 
                            onClick={() => { if (canAfford) (window as any).buyUpgrade?.(u.key, cost); }}
                            className={`flex justify-between items-center px-4 py-2 bg-[#001e32]/90 border border-[#00ffcc44] rounded-lg ${canAfford ? 'cursor-pointer hover:border-[#00ffcc] hover:bg-[#003c50]/90 transition-all' : 'opacity-45 cursor-not-allowed'}`}>
                         <div>
                           <div className="text-[#00ffcc] text-[11px] tracking-[1px]">{u.name}</div>
                           <div className="text-[#888] text-[9px] tracking-[0.5px]">{u.desc} ({cur}/{u.max})</div>
                         </div>
                         <div className="text-[#ffcc00] text-[10px]">{cost}pts</div>
                       </div>
                     );
                   })}
                 </div>

                 <Button 
                   variant="outline"
                   className="mt-3 py-[18px] px-8 bg-transparent border-[1.5px] border-[#00ffcc] text-[#00ffcc] font-mono text-[11px] tracking-[2px] hover:bg-[#00ffcc22] hover:text-[#00ffcc] transition-all"
                   onClick={() => (window as any).startNextWave?.()}
                 >CONTINUE →</Button>
               </CardContent>
             </Card>
          )}
        </div>
      )}
    </div>
  );
}
