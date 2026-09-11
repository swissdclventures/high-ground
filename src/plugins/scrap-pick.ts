/**
 * Host NPC pick: hover paints the yellow tube, click locks the mark.
 *
 * THE LAW: every NPC is hoverable and selectable. Role actions (trade, talk)
 * run on click after the lock. E provokes a fight on the locked (or hovered)
 * NPC when Scrap is on. Never pick the nearest body in a crowd.
 *
 * Canon: rules/npc-select.md
 */
import {
  engine,
  Entity,
  InputAction,
  Material,
  MaterialTransparencyMode,
  MeshRenderer,
  PointerEventType,
  PointerEvents,
  Transform,
  VisibilityComponent,
  inputSystem,
} from "@dcl/sdk/ecs";
import { Color3, Color4, Vector3 } from "@dcl/sdk/math";

export type ScrapPickMode = "off" | "hover" | "selected";

export interface ScrapTargetMark {
  root: Entity;
  disc: Entity;
  pip: Entity;
  aura: Entity;
  mode: ScrapPickMode;
}

let selectedNpcIndex: number | null = null;
let hoveredNpcIndex: number | null = null;
const hitIndex = new Map<Entity, number>();
const clickActions = new Map<number, () => void>();
const provokeHooks: Array<(npcIndex: number) => void> = [];
let pickSystemOn = false;

const HOVER = { r: 1, g: 0.72, b: 0.16 };
const SELECTED = { r: 1, g: 0.22, b: 0.08 };

export function hoverScrapNpc(index: number | null): void {
  hoveredNpcIndex = index;
}

export function selectScrapNpc(index: number): void {
  selectedNpcIndex = index;
}

export function clearScrapNpcPick(): void {
  selectedNpcIndex = null;
  hoveredNpcIndex = null;
}

export function selectedScrapNpcIndex(): number | null {
  return selectedNpcIndex;
}

export function hoveredScrapNpcIndex(): number | null {
  return hoveredNpcIndex;
}

/** The NPC E will provoke: the click-lock, or the one under the pointer. */
export function scrapProvokeNpcIndex(): number | null {
  return selectedNpcIndex ?? hoveredNpcIndex;
}

export function scrapPickModeFor(npcIndex: number, leased: boolean): ScrapPickMode {
  if (leased) return "off";
  if (selectedNpcIndex === npcIndex) return "selected";
  if (hoveredNpcIndex === npcIndex) return "hover";
  return "off";
}

/** Click action for a stationed NPC (vendor trade, later: inspect). Crowd has none. */
export function setNpcClickAction(npcIndex: number, action: () => void): void {
  clickActions.set(npcIndex, action);
}

export function runNpcClickAction(npcIndex: number): void {
  clickActions.get(npcIndex)?.();
}

export function hasNpcClickAction(npcIndex: number): boolean {
  return clickActions.has(npcIndex);
}

/** Fired when E provokes this index — vendor closes the bag before the bout. */
export function onNpcProvoke(hook: (npcIndex: number) => void): void {
  provokeHooks.push(hook);
}

export function notifyNpcProvoke(npcIndex: number): void {
  for (const hook of provokeHooks) hook(npcIndex);
}

export function registerScrapHit(hit: Entity, npcIndex: number): void {
  hitIndex.set(hit, npcIndex);
  ensureHoverEvents(hit);
  ensurePickSystem();
}

export function unregisterScrapHit(hit: Entity): void {
  const index = hitIndex.get(hit);
  hitIndex.delete(hit);
  if (hoveredNpcIndex === index) hoveredNpcIndex = null;
  if (selectedNpcIndex === index) selectedNpcIndex = null;
}

export function createScrapTargetMark(parent: Entity): ScrapTargetMark {
  const root = engine.addEntity();
  Transform.create(root, { parent, position: Vector3.create(0, 0, 0) });

  const disc = engine.addEntity();
  Transform.create(disc, {
    parent: root,
    position: Vector3.create(0, 0.04, 0),
    scale: Vector3.create(1.55, 0.045, 1.55),
  });
  MeshRenderer.setCylinder(disc, 0.5, 0.5);

  const aura = engine.addEntity();
  Transform.create(aura, {
    parent: root,
    position: Vector3.create(0, 1.05, 0),
    scale: Vector3.create(1.05, 2.1, 1.05),
  });
  MeshRenderer.setCylinder(aura, 0.5, 0.5);

  const pip = engine.addEntity();
  Transform.create(pip, {
    parent: root,
    position: Vector3.create(0, 2.32, 0),
    scale: Vector3.create(0.2, 0.2, 0.2),
  });
  MeshRenderer.setBox(pip);

  VisibilityComponent.create(disc, { visible: false });
  VisibilityComponent.create(aura, { visible: false });
  VisibilityComponent.create(pip, { visible: false });
  // A MeshRenderer with NO Material draws as an unlit WHITE surface. These three
  // only got a material on the first hover/select paint, so between creation and
  // that first paint they were a white disc, a white body-sized cylinder and a
  // white box wrapped around the NPC — relying entirely on VisibilityComponent
  // to hide them. LOD churn destroys and recreates this mark every time a bot
  // promotes, so that window recurs constantly as you walk the crowd. Paint them
  // fully transparent up front: invisible by material AND by visibility.
  glow(disc, HOVER, 0, 0);
  glow(aura, HOVER, 0, 0);
  glow(pip, HOVER, 0, 0);
  return { root, disc, pip, aura, mode: "off" };
}

export function destroyScrapTargetMark(mark: ScrapTargetMark | null): void {
  if (!mark) return;
  engine.removeEntity(mark.disc);
  engine.removeEntity(mark.pip);
  engine.removeEntity(mark.aura);
  engine.removeEntity(mark.root);
}

export function paintScrapTargetMark(mark: ScrapTargetMark | null, mode: ScrapPickMode): void {
  if (!mark || mark.mode === mode) return;
  mark.mode = mode;
  const on = mode !== "off";
  VisibilityComponent.createOrReplace(mark.disc, { visible: on });
  VisibilityComponent.createOrReplace(mark.aura, { visible: on });
  VisibilityComponent.createOrReplace(mark.pip, { visible: on });
  if (!on) return;
  const c = mode === "selected" ? SELECTED : HOVER;
  const hot = mode === "selected";
  glow(mark.disc, c, hot ? 0.72 : 0.5, hot ? 2.4 : 1.5);
  glow(mark.aura, c, hot ? 0.22 : 0.12, hot ? 1.4 : 0.7);
  glow(mark.pip, c, hot ? 0.95 : 0.7, hot ? 3 : 1.8);
}

function glow(
  entity: Entity,
  c: { r: number; g: number; b: number },
  alpha: number,
  emissive: number
): void {
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(c.r, c.g, c.b, alpha),
    roughness: 1,
    metallic: 0,
    emissiveColor: Color3.create(c.r, c.g, c.b),
    emissiveIntensity: emissive,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
  });
}

function ensureHoverEvents(hit: Entity): void {
  const pe = PointerEvents.getMutableOrNull(hit);
  if (!pe) return;
  const hasEnter = pe.pointerEvents.some((row) => row.eventType === PointerEventType.PET_HOVER_ENTER);
  if (hasEnter) return;
  pe.pointerEvents.push({
    eventType: PointerEventType.PET_HOVER_ENTER,
    eventInfo: { button: InputAction.IA_POINTER, maxDistance: 16, showFeedback: false },
  });
  pe.pointerEvents.push({
    eventType: PointerEventType.PET_HOVER_LEAVE,
    eventInfo: { button: InputAction.IA_POINTER, maxDistance: 16, showFeedback: false },
  });
}

function ensurePickSystem(): void {
  if (pickSystemOn) return;
  pickSystemOn = true;
  engine.addSystem(scrapPickSystem);
}

function scrapPickSystem(): void {
  for (const [hit, index] of hitIndex) {
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_HOVER_ENTER, hit)) {
      hoveredNpcIndex = index;
    }
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_HOVER_LEAVE, hit)) {
      if (hoveredNpcIndex === index) hoveredNpcIndex = null;
    }
  }
}
