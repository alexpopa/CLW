import { LANE_WIDTH, MAP } from "@lw/sim";

/**
 * How the lanes of a match are laid out in the world (presentation only; the sim knows lanes by index).
 * World: x along the lanes, z across them, y up. Lane 0 is the far lane; each further lane lies nearer the camera,
 * separated from the last by a strip of graveyard.
 */
export const LANE_LEN = MAP.laneLength / 1000;
export const LANE_W = LANE_WIDTH / 1000;
export const LANE_GAP = 8;
export const LANE_PITCH = LANE_W + LANE_GAP;
/** World z of a lane's far edge. */
export const laneZ = (lane: number): number => lane * LANE_PITCH;
/** World z of the middle of the whole battlefield. */
export const midZ = (lanes: number): number => (laneZ(lanes - 1) + LANE_W) / 2;
/** Which lane a world z falls in (the graveyard strips belong to the nearer lane), and the lane-local y in milli-units. */
export function laneAt(z: number, lanes: number): { lane: number; y: number } {
  const lane = Math.max(0, Math.min(lanes - 1, Math.floor((z + LANE_GAP / 2) / LANE_PITCH)));
  return { lane, y: (z - laneZ(lane)) * 1000 };
}
/** The battlefield's extent across the lanes, with a margin, for the minimap: [far z, near z]. */
export const fieldZ = (lanes: number): [number, number] => [-LANE_GAP / 2, laneZ(lanes - 1) + LANE_W + LANE_GAP / 2];
