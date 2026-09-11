/**
 * Decentraland's cylinder primitive uses the radii passed to `setCylinder` before
 * applying the entity transform. Keep the primitive at radius 0.5, then scale by the
 * requested diameter so an authored 6 m zone remains a 6 m-radius disc in-world.
 */
export const DCL_DISC_PRIMITIVE_RADIUS = 0.5;

export function dclDiscScale(radius: number, height: number): {
  x: number;
  y: number;
  z: number;
} {
  const diameter = Math.max(0, radius) * 2;
  return { x: diameter, y: height, z: diameter };
}
