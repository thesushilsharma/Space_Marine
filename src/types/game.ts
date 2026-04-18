import { PU_TYPES } from "@/lib/game-constants";
import * as PIXI from "pixi.js";

export interface Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  av: number;
  r: number;
  gfx?: PIXI.Graphics;
  [key: string]: any;
}

export interface Player extends Entity {
  shield: number;
  invincible: number;
  boost: number;
  boostCooldown: number;
}

export interface Bullet extends Entity {
  life: number;
  maxLife: number;
  fromEnemy: boolean;
  color: number;
}

export interface Asteroid extends Entity {
  size: number;
  gen: number;
  col: number;
  hp: number;
}

export interface Enemy extends Entity {
  type: "scout" | "gunship";
  hp: number;
  shootTimer: number;
}

export interface Boss extends Entity {
  hp: number;
  maxHp: number;
  shootTimer: number;
  teleTimer: number;
  shieldTimer: number;
  wave: number;
}

export interface Powerup extends Entity {
  pu: typeof PU_TYPES[number];
  life: number;
}