import type { FloorZoneShape } from "./floor-zones";

/** Building-local XZ point inside a floor zone shape. */
export function pointInFloorZone(x: number, z: number, shape: FloorZoneShape): boolean {
  if (shape.kind === "circle") {
    const dx = x - shape.centerX;
    const dz = z - shape.centerZ;
    return dx * dx + dz * dz <= shape.radius * shape.radius;
  }
  const halfW = shape.width / 2;
  const halfD = shape.depth / 2;
  return (
    x >= shape.centerX - halfW &&
    x <= shape.centerX + halfW &&
    z >= shape.centerZ - halfD &&
    z <= shape.centerZ + halfD
  );
}
