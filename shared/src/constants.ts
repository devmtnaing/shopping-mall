// Numbers shared by client and server. Tune movement feel here, nowhere else.

/** Fixed simulation step (seconds). */
export const STEP = 1 / 60;
/** Network tick rate (Hz). Client sends input every STEP_HZ / NET_HZ steps. */
export const NET_HZ = 15;

/** Player body and movement. Metres, seconds. */
export const PLAYER = {
  /** Capsule radius and total height. */
  radius: 0.3,
  height: 1.75,
  walkSpeed: 3.2,
  runSpeed: 6.4,
  /** How fast velocity approaches the target (1/s). Higher = snappier. */
  groundAccel: 14,
  airAccel: 4,
  gravity: 20,
  /** Initial upward speed of a jump: height = v² / 2g ≈ 1.06 m. */
  jumpSpeed: 6.5,
  /** Tallest ledge you walk up without jumping (flagship steps are 0.2 m; benches 0.45 m block). */
  stepHeight: 0.35,
  /** Steepest walkable slope in degrees (escalators are ~32°). */
  maxSlope: 42,
  /** How fast the body turns to face its movement direction (1/s). */
  turnRate: 12,
  /** Below this height you fell out of the world and respawn. */
  killY: -20,
} as const;

/** Third-person camera. Metres, radians, 1/s rates. */
export const CAMERA = {
  /** Height of the point the camera orbits, above the feet. */
  pivotHeight: 1.55,
  /** Sideways offset so the character sits a little left of centre. */
  shoulder: 0.35,
  minDistance: 2,
  maxDistance: 9,
  startDistance: 4.5,
  startPitch: -0.28,
  minPitch: -1.2,
  maxPitch: 0.5,
  /** How fast the pivot follows the player horizontally / vertically (vertical is softer, for stairs). */
  followRate: 16,
  verticalRate: 9,
  /** How fast the camera eases back out after a wall pushed it in. Pushing in is instant. */
  zoomOutRate: 4,
  /** Camera collision radius: how close it may get to a wall. */
  radius: 0.22,
  /** After this long without looking around, walking swings the camera back behind you. */
  recenterDelay: 1.5,
  recenterRate: 1.6,
} as const;
