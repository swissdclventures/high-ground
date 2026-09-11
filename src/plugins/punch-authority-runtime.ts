/**
 * THE TOGGLE, as the running scene sees it.
 *
 * `punch-machine.ts` must not import the server SDK. It is four thousand lines
 * of rendering, audio and HUD that only ever run on a player's device, and a
 * static `@dcl/sdk/network` import from it would drag the server transport into
 * a bundle that has no use for it — and, on a build without the auth-server
 * SDK installed, would simply fail to resolve.
 *
 * So the machine asks THIS module what authority to use, and this module knows
 * nothing until something tells it. The default is the shipped serverless
 * model; the server entry point overrides it during boot, before any machine is
 * constructed. Nothing else may call the setter.
 */
import { PUNCH_AUTHORITY_DEFAULT, type PunchAuthorityMode } from '@shared/punch-authority'
import type { PunchCompetitionBus } from './punch-machine-network'

export interface PunchAuthorityRuntime {
  authority: PunchAuthorityMode
  /** The server's peer id, lower-cased. Empty in coordinator mode. */
  serverId: string
  /** The transport. `undefined` means "the explorer's own MessageBus". */
  bus?: PunchCompetitionBus
}

let current: PunchAuthorityRuntime = {
  authority: PUNCH_AUTHORITY_DEFAULT,
  serverId: ''
}

/**
 * Called once, from the auth-server boot path, before machines are built.
 *
 * ‼️LATE IS THE SAME AS NEVER. A machine reads this at construction and keeps
 * what it read — `startPunchCompetitionNetwork` captures the mode in a closure
 * and never asks again. Setting it after the first machine exists produces a
 * scene where some machines defer to a server and others elect themselves,
 * which is worse than either model on its own.
 */
export function setPunchAuthority(next: PunchAuthorityRuntime): void {
  current = next
}

export function punchAuthority(): PunchAuthorityRuntime {
  return current
}

/**
 * In a Multiplayer Server scene only the headless server may call `syncEntity`.
 * A client call errors and can leave the Room stuck at ready=NO (desktop
 * Explorer, HIGHGROUND 2026-09-10). Vehicles and NPCs skip CRDT attach when
 * this returns false; they stay local.
 */
export function clientMaySyncEntity(): boolean {
  return current.authority !== 'server'
}
