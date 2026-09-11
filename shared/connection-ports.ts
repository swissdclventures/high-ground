/**
 * Connection port / plug contract for kit assembly and compile-time snapping.
 */

export type PortKind =
  | "walk_access"
  | "landing"
  | "terrace_access"
  | "column_socket"
  | "column_override";

export type CirculationKind = "l_ramp" | "straight_ramp" | "elevator_shaft" | "stair_run";

export type ShaftEdgeId = "south" | "east" | "north" | "west";

/** Max horizontal gap between mated port frames (meters). */
export const PORT_SNAP_TOLERANCE_M = 0.02;

export interface PortFrame {
  x: number;
  y: number;
  z: number;
  /** Radians — direction the port faces (outward from host). */
  yaw: number;
  width: number;
}

export interface ConnectionPort {
  id: string;
  hostComponentId: string;
  kind: PortKind;
  floorIndex: number;
  edgeId?: ShaftEdgeId;
  frame: PortFrame;
  accepts: CirculationKind[];
  occupiedBy?: string | null;
}

export interface PlugRequirement {
  plugId: string;
  kind: PortKind;
  required: boolean;
}

export interface ComponentPlugDef {
  circulationKind: CirculationKind;
  componentType: string;
  plugs: PlugRequirement[];
}

export interface PortMating {
  plugId: string;
  componentId: string;
  portId: string;
}

export const CIRCULATION_COMPONENT_TYPES = [
  "l_ramp",
  "elevator_shaft",
  "stair_run",
] as const;

export function isCirculationComponentType(type: string): boolean {
  return (
    type === "l_ramp" ||
    type === "elevator_shaft" ||
    type === "stair_run" ||
    type === "ramp_run"
  );
}

export function edgeIdFromEntryEdge(entryEdge: ShaftEdgeId): ShaftEdgeId {
  return entryEdge;
}

export function defaultEntryEdgeForFloor(floorIndex: number): ShaftEdgeId {
  return floorIndex % 2 === 0 ? "south" : "south";
}

const OPPOSITE_EDGE: Record<ShaftEdgeId, ShaftEdgeId> = {
  south: "north",
  north: "south",
  east: "west",
  west: "east",
};

export function exitEdgeForEntry(entryEdge: ShaftEdgeId): ShaftEdgeId {
  return OPPOSITE_EDGE[entryEdge];
}
