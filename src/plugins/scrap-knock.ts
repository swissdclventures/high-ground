/**
 * First-person hit knockback. NPC avatars have no physics body, so a shove is
 * `movePlayerTo` — the same hop Bubble Bash uses, clamped to open plaza so
 * Explorer cannot unstick you through a tower.
 */
import { Transform, engine } from "@dcl/sdk/ecs";
import { movePlayerTo } from "~system/RestrictedActions";
import { scrapKoGround, scrapKoKnockbackPlan, SCRAP_KO_MAX_TRAVEL_M } from "@shared/scrap-ko-ground";
import type { ScrapHitKnockSpec } from "@shared/scrap-hit-physics";

let knockBusyUntil = 0;
let knockLand: { x: number; y: number; z: number } | null = null;
let knockLandAt = 0;

export function executeScrapHitKnock(
  foeX: number,
  foeZ: number,
  spec: ScrapHitKnockSpec
): boolean {
  const now = Date.now();
  if (now < knockBusyUntil) return false;
  const me = Transform.getOrNull(engine.PlayerEntity);
  if (!me) return false;
  const ground = scrapKoGround();
  const plan = scrapKoKnockbackPlan({
    originX: me.position.x,
    originY: me.position.y,
    originZ: me.position.z,
    foeX,
    foeZ,
    backM: spec.backM,
    upM: spec.liftM,
    solids: ground.solids,
    sceneMin: ground.sceneMin,
    sceneMax: ground.sceneMax,
    minTravelM: 0.28,
  });
  if (plan.stayPut) return false;
  const hopM = Math.hypot(plan.destX - me.position.x, plan.destZ - me.position.z);
  if (hopM > SCRAP_KO_MAX_TRAVEL_M + 0.2) return false;
  const duration = Math.max(0.18, spec.durationMs / 1000);
  knockBusyUntil = now + spec.durationMs + 80;
  if (plan.appliedLiftM > 0.05) {
    void movePlayerTo({
      newRelativePosition: { x: plan.apexX, y: plan.apexY, z: plan.apexZ },
      duration: duration / 2,
    });
    knockLand = { x: plan.destX, y: plan.destY, z: plan.destZ };
    knockLandAt = now + spec.durationMs / 2;
  } else {
    knockLand = null;
    void movePlayerTo({
      newRelativePosition: { x: plan.destX, y: plan.destY, z: plan.destZ },
      duration,
    });
  }
  return true;
}

export function tickScrapHitKnock(nowMs: number = Date.now()): void {
  if (!knockLand || nowMs < knockLandAt) return;
  const dest = knockLand;
  knockLand = null;
  void movePlayerTo({
    newRelativePosition: dest,
    duration: 0.18,
  });
}

export function scrapHitKnockBusy(nowMs: number = Date.now()): boolean {
  return nowMs < knockBusyUntil || knockLand !== null;
}
