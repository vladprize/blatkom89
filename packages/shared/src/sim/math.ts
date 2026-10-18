export interface Vec2 {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Normalizes an angle into [-PI, PI). */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDiff(a, b) * t;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Aim angles travel as uint16; quantize identically on client and server. */
export function quantizeAngle(a: number): number {
  const w = wrapAngle(a) + Math.PI; // [0, TAU)
  return Math.round((w / TAU) * 65535) & 0xffff;
}

export function dequantizeAngle(q: number): number {
  return (q / 65535) * TAU - Math.PI;
}

export function quantizeAxis(v: number): number {
  return Math.round(clamp(v, -1, 1) * 127);
}
