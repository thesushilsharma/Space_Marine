export const GAME_CONFIG = {
  W: 820,
  H: 520,
  FPS: 60,
};

export const PU_TYPES = [
  { id: "shield", label: "SHIELD", color: 0x00aaff, text: "SH" },
  { id: "rapid", label: "RAPID FIRE", color: 0xff8800, text: "RF" },
  { id: "trishot", label: "TRI-SHOT", color: 0x00ff88, text: "3X" },
  { id: "bomb", label: "SMART BOMB", color: 0xff3333, text: "BM" },
  { id: "slow", label: "TIME SLOW", color: 0xaa00ff, text: "TS" },
  { id: "life", label: "EXTRA LIFE", color: 0xff0088, text: "HP" },
  { id: "magnet", label: "MAGNET", color: 0xffff00, text: "MG" },
] as const;

export const UPG_DEFS = [
  { key: "speed", name: "THRUSTER BOOST", desc: "Increase ship speed", cost: 500, max: 3 },
  { key: "fireRate", name: "FIRE RATE", desc: "Shoot faster", cost: 400, max: 3 },
  { key: "triShot", name: "TRI-SHOT UNLOCK", desc: "Always fire 3 bullets", cost: 700, max: 1 },
  { key: "shield", name: "PASSIVE SHIELD", desc: "Auto-regen shield", cost: 800, max: 2 },
  { key: "bomb", name: "BOMB CAPACITY", desc: "More bomb pickups", cost: 600, max: 2 },
] as const;