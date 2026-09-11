/**
 * One answer to "if I jump in now, what will Explorer load?"
 *
 * The selected route decides what Jump-in loads: a World-name route resolves
 * Decentraland's converted copy; a realm route loads the selected self-hosted
 * destination directly. Files on a different destination are not that answer.
 */
import {
  formatLife,
  type SceneLifeInventory,
} from "./scene-life-inventory";
import type { EntryRoute } from "./publish-destinations";

export type LiveReceiptVerdict =
  | "enter-now"
  | "converting"
  | "servers-disagree"
  | "mirror-pending"
  | "editor-not-live"
  | "no-live-scene"
  | "no-destination";

export interface LiveCopySnapshot {
  entityId?: string;
  stamp?: string;
  publishedAt?: string;
  life?: SceneLifeInventory;
  /**
   * The scene RUNTIME's source hash, read back out of the deployed scene.
   *
   * Every publish already ships `source-hash.txt` — the fingerprint of the code
   * inside bin/index.js. Nothing had ever read it back, so this receipt could
   * say "enter now", completely honestly, about the scene's CONTENT while the
   * CODE running it was days old and no instrument anywhere said so. Three days
   * of publishing from a stale folder looked, from here, like nothing at all.
   */
  runtimeHash?: string;
  /**
   * When the live scene's runtime was BUILT, off its own `runtime-build.json`.
   *
   * The publish time is not a substitute: it dates the CONTENT, not the code. A
   * scene published this morning can be carrying month-old runtime, and dating
   * the code by the publish would call that Builder "behind" when it is ahead.
   */
  runtimeBuiltAt?: string;
  /** The commit that runtime was built from, when it recorded one. */
  runtimeCommit?: string;
}

/** How the live scene's code compares with the code this Builder would ship. */
export type RuntimeVerdict = "same" | "will-update" | "builder-behind" | "unknown";

export interface RuntimeComparison {
  verdict: RuntimeVerdict;
  live?: string;
  builder?: string;
  /** Build times, carried so the UI can say "11 days old" instead of eight hex digits. */
  liveBuiltAt?: string;
  builderBuiltAt?: string;
}

/**
 * "today" / "3 days old" / "11 days old" — how a person reads an age.
 *
 * Eight hex digits identify a runtime and tell a non-technical reader nothing.
 * Everyone who publishes a scene is one of those readers, including the people
 * who will never own the Builder that served them their runtime.
 */
export function runtimeAge(iso: string | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day old";
  return `${days} days old`;
}

export interface ConversionSnapshot {
  entityId: string;
  windows?: string;
  mac?: string;
  ready: boolean;
}

export interface LiveReceiptInput {
  worldName?: string;
  editor: { name: string; life: SceneLifeInventory };
  database?: LiveCopySnapshot | null;
  owner?: LiveCopySnapshot | null;
  dcl?: LiveCopySnapshot | null;
  conversion?: ConversionSnapshot | null;
  /** Entity id of a publish that just uploaded — when set, enter-now requires this id on the entry copy. */
  expectedEntityId?: string;
  /**
   * The runtime hash THIS Builder would publish, read from the scene template it
   * is serving. Undefined when it could not be read — in which case the receipt
   * reports "unknown" rather than inventing agreement.
   */
  builderRuntimeHash?: string;
  /** When this Builder's runtime was built, if known. Decides which side is older. */
  builderRuntimeStamp?: string;
  /**
   * How visitors of the SELECTED destination arrive.
   *
   * `name` (the default, and the only behaviour before 2026-08-27) means the
   * Decentraland copy is what Explorer paints, gated on its asset-bundle
   * conversion. `realm` means the visitor deep-links into the owner's server,
   * which serves content directly: that copy IS the answer, and Decentraland's
   * conversion queue has no part in it. Applying the conversion gate to a realm
   * destination is a wait for a process that route never runs.
   */
  entryRoute?: EntryRoute;
}

export interface LiveReceipt {
  verdict: LiveReceiptVerdict;
  /** The one sentence that answers "what happens if I jump in now?" */
  headline: string;
  action: string;
  /** True only when Jump-in will render the current (or just-published) DCL entity. */
  jumpSafe: boolean;
  jumpLoads?: {
    entityId: string;
    stamp: string;
    converted: boolean;
  };
  copies: {
    editor: { label: string; detail: string };
    database?: { label: string; detail: string };
    owner?: { label: string; detail: string };
    dcl?: { label: string; detail: string };
    conversion?: { label: string; detail: string };
    runtime?: { label: string; detail: string };
  };
  /**
   * Whether the CODE running the live scene is the code this Builder would ship.
   * Deliberately separate from `verdict`, which is about the scene's content: a
   * scene can be perfectly live and enterable while running a runtime nobody
   * meant to ship. Those are two different questions and conflating them is how
   * one of them went unasked for three days.
   */
  runtime: RuntimeComparison;
}

export type LiveDotTone = "ready" | "converting" | "idle";

/** Toolbar dot next to the World chip: green = jump-in will paint this publish. */
export function liveDotTone(receipt: LiveReceipt): LiveDotTone {
  if (receipt.jumpSafe) return "ready";
  if (
    receipt.verdict === "converting" ||
    receipt.verdict === "mirror-pending" ||
    receipt.verdict === "servers-disagree"
  ) {
    return "converting";
  }
  return "idle";
}

export function liveDotTitle(receipt: LiveReceipt): string {
  const tone = liveDotTone(receipt);
  if (tone === "ready") {
    const stamp = receipt.jumpLoads?.stamp ?? "this publish";
    return `Green — the selected entry route will show ${stamp}. Safe to jump in.`;
  }
  if (receipt.verdict === "converting") {
    return "Amber — files are up, Explorer is still converting. Jump-in shows the previous complete build.";
  }
  if (receipt.verdict === "servers-disagree") {
    return `Amber — destinations disagree. ${receipt.headline}`;
  }
  if (receipt.verdict === "mirror-pending") {
    return `Amber — the selected destination is behind. ${receipt.headline}`;
  }
  return "No live Explorer status yet.";
}

export function formatPublishStamp(iso: string | undefined | null): string {
  if (!iso || iso.length < 19) return "unknown";
  return `${iso.slice(5, 10)} ${iso.slice(11, 19)} UTC`;
}

export function shortEntityId(id: string | undefined | null): string {
  if (!id) return "—";
  return id.slice(-6);
}

export function shortRuntimeHash(hash: string | undefined | null): string {
  return hash ? hash.slice(0, 8) : "unknown";
}

/**
 * Compare the live scene's runtime with this Builder's.
 *
 * `builder-behind` is the one that matters and the one that had no name before:
 * the Builder is serving OLDER code than the scene already running, so
 * publishing would quietly roll the scene's behaviour backwards. Naming it is
 * the whole point — it is what a stale checkout does, silently, on every
 * publish, and nothing on screen used to change.
 *
 * Direction needs both stamps. With only the hashes we can say the publish will
 * CHANGE the code but not which way, and saying so is better than guessing.
 */
export function compareRuntimes(
  live: string | undefined,
  builder: string | undefined,
  liveStamp?: string,
  builderStamp?: string
): RuntimeComparison {
  const at = { liveBuiltAt: liveStamp, builderBuiltAt: builderStamp };
  if (!live || !builder) return { verdict: "unknown", live, builder, ...at };
  if (live === builder) return { verdict: "same", live, builder, ...at };
  if (liveStamp && builderStamp && builderStamp < liveStamp) {
    return { verdict: "builder-behind", live, builder, ...at };
  }
  return { verdict: "will-update", live, builder, ...at };
}

/** One sentence about the code, or null when there is nothing to say. */
export function runtimeHeadline(runtime: RuntimeComparison): string | null {
  switch (runtime.verdict) {
    case "will-update": {
      const age = runtimeAge(runtime.liveBuiltAt);
      return `Publishing also updates the scene's code${age ? ` — the live version is ${age}` : ""} (${shortRuntimeHash(runtime.live)} → ${shortRuntimeHash(runtime.builder)}).`;
    }
    case "builder-behind": {
      const b = runtimeAge(runtime.builderBuiltAt);
      const l = runtimeAge(runtime.liveBuiltAt);
      return `This Builder serves OLDER code${b ? ` (${b})` : ""} than the live scene${l ? ` (${l})` : ""}, so publishing would undo behaviour that is already there.`;
    }
    default:
      return null;
  }
}

function copyDetail(copy: LiveCopySnapshot, fallbackStamp?: string): string {
  const stamp = formatPublishStamp(copy.stamp ?? copy.publishedAt ?? fallbackStamp);
  const entity = copy.entityId ? ` · ${shortEntityId(copy.entityId)}` : "";
  const life = copy.life ? ` · ${formatLife(copy.life)}` : "";
  return `${stamp}${entity}${life}`;
}

function lifeLooksSame(a?: SceneLifeInventory, b?: SceneLifeInventory): boolean {
  if (!a || !b) return true;
  return (
    a.npcs === b.npcs &&
    a.pads === b.pads &&
    a.zones === b.zones &&
    a.lit === b.lit &&
    a.apps.join(",") === b.apps.join(",") &&
    a.buildings === b.buildings
  );
}

/**
 * The scene's CONTENT verdict — is what is deployed what you meant to deploy.
 * Wrapped by `buildLiveReceipt`, which adds the answer to the second question:
 * is the CODE running it the code you meant to ship.
 */
function buildContentReceipt(input: LiveReceiptInput): Omit<LiveReceipt, "runtime"> {
  const editorDetail = formatLife(input.editor.life);
  const copies: LiveReceipt["copies"] = {
    editor: { label: "This editor", detail: editorDetail },
  };
  if (input.database) {
    copies.database = { label: "Database", detail: copyDetail(input.database) };
  }
  if (input.owner) {
    copies.owner = { label: "Your server", detail: copyDetail(input.owner) };
  }
  if (input.dcl) {
    copies.dcl = { label: "Decentraland (jump-in)", detail: copyDetail(input.dcl) };
  }
  if (input.conversion) {
    const windows = input.conversion.windows ?? "unknown";
    copies.conversion = {
      label: "Explorer conversion",
      detail: input.conversion.ready
        ? `windows complete — Explorer will paint ${shortEntityId(input.conversion.entityId)}`
        : `windows ${windows} — Explorer still paints the previous complete build`,
    };
  }

  if (!input.worldName) {
    return {
      verdict: "no-destination",
      headline: "No World destination — nothing to jump into.",
      action: "Choose a World destination first.",
      jumpSafe: false,
      copies,
    };
  }

  if (!input.dcl && !input.owner) {
    return {
      verdict: "no-live-scene",
      headline: "Nothing is live at this destination yet.",
      action: "Publish this scene, then wait until this panel says enter-now.",
      jumpSafe: false,
      copies,
    };
  }

  const nameEntry = (input.entryRoute ?? "name") === "name";
  /** The copy a visitor of the selected destination actually loads. */
  const entry = nameEntry ? input.dcl : (input.owner ?? input.dcl);
  const otherCopy = nameEntry ? input.owner : input.dcl;
  const entryLabel = nameEntry ? "Decentraland" : "your server";
  const otherLabel = nameEntry ? "your server" : "Decentraland";

  if (!entry) {
    return {
      verdict: "mirror-pending",
      headline: nameEntry
        ? "Your server has this scene, but Decentraland does not yet — jump-in still loads the old name-entry copy."
        : "Decentraland has this scene, but the destination you publish to does not — a realm deep link would load nothing new.",
      action: nameEntry
        ? "Wait. Do not republish. Jump-in uses Decentraland's copy."
        : "Publish to this destination, or switch the default destination to the one that has it.",
      jumpSafe: false,
      copies,
    };
  }

  const jumpLoads = {
    entityId: entry.entityId ?? "",
    stamp: formatPublishStamp(entry.stamp ?? entry.publishedAt),
    // A realm destination never waits on Decentraland's conversion, so its copy
    // counts as converted the moment the destination lists it.
    converted: nameEntry
      ? Boolean(input.conversion?.ready && input.conversion.entityId === entry.entityId)
      : true,
  };

  if (otherCopy?.entityId && entry.entityId && otherCopy.entityId !== entry.entityId) {
    return {
      verdict: "servers-disagree",
      headline: `If you enter now you load ${entryLabel}'s copy (${jumpLoads.stamp} · ${shortEntityId(entry.entityId)}); ${otherLabel} holds a different one.`,
      action: `Check the per-destination status in the Publish menu — ${otherLabel} may still be receiving this build.`,
      jumpSafe: false,
      jumpLoads,
      copies,
    };
  }

  if (input.expectedEntityId && entry.entityId && entry.entityId !== input.expectedEntityId) {
    return {
      verdict: "mirror-pending",
      headline: `The upload (${shortEntityId(input.expectedEntityId)}) is not what entry loads yet — ${entryLabel} still has ${shortEntityId(entry.entityId)}.`,
      action: `Wait for ${entryLabel} to list the new entity. Do not republish.`,
      jumpSafe: false,
      jumpLoads,
      copies,
    };
  }

  if (!jumpLoads.converted) {
    return {
      verdict: "converting",
      headline: `Files are on Decentraland, but Explorer is still painting the previous complete build. Jump-in will not show ${jumpLoads.stamp} until Windows conversion finishes.`,
      action: "Wait. Do not republish — that sends a new entity to the back of their queue.",
      jumpSafe: false,
      jumpLoads,
      copies,
    };
  }

  const liveLife = entry.life ?? otherCopy?.life;
  if (liveLife && !lifeLooksSame(input.editor.life, liveLife) && !input.expectedEntityId) {
    return {
      verdict: "editor-not-live",
      headline: `If you enter now you load ${jumpLoads.stamp} · ${shortEntityId(entry.entityId)} (${formatLife(liveLife)}). That is live — this editor is different.`,
      action: "Publish this editor to update the world, or Reload from database to match live.",
      jumpSafe: true,
      jumpLoads,
      copies,
    };
  }

  return {
    verdict: "enter-now",
    headline: nameEntry
      ? `If you jump in now you load ${jumpLoads.stamp} · ${shortEntityId(entry.entityId)}. Conversion is complete — this is what Explorer will paint.`
      : `${jumpLoads.stamp} · ${shortEntityId(entry.entityId)} is live on the destination you publish to — a realm deep link loads it now, with no conversion step.`,
    action: "Enter the world. Fully close Explorer first if you were already in it.",
    jumpSafe: true,
    jumpLoads,
    copies,
  };
}

/**
 * The whole answer: what is live, AND whether it is running your code.
 *
 * The runtime line is attached to every verdict, including the happy ones —
 * "enter now" was the exact state the scene was in while its code was three
 * days stale, so a runtime check that only ran on unhappy paths would have
 * caught nothing.
 */
export function buildLiveReceipt(input: LiveReceiptInput): LiveReceipt {
  const base = buildContentReceipt(input);
  // The ENTRY copy is the one whose runtime a visitor actually executes: the
  // Decentraland copy for a name link, the owner's server for a realm link.
  const nameEntry = (input.entryRoute ?? "name") === "name";
  const entry = nameEntry ? input.dcl : (input.owner ?? input.dcl);
  // BOTH DATES OFF THE SAME CLOCK, or none at all.
  //
  // These used to be the scene's PUBLISH time versus the HTTP Last-Modified of
  // the Builder's copy — two unrelated measurements, so the comparison between
  // them meant nothing. Both sides now read a build time that travels inside the
  // runtime itself. A scene too old to carry one dates to nothing and the verdict
  // says "will-update" without claiming a direction, which is the truth.
  const runtime = compareRuntimes(
    entry?.runtimeHash,
    input.builderRuntimeHash,
    entry?.runtimeBuiltAt,
    input.builderRuntimeStamp
  );
  // AGES, NOT HASHES. The hash identifies a runtime; it does not tell a reader
  // whether they should care. Most people publishing a scene — including everyone
  // using a Builder they do not own — read "11 days old" and nothing else.
  const liveAge = runtimeAge(runtime.liveBuiltAt);
  const builderAge = runtimeAge(runtime.builderBuiltAt);
  const detail =
    runtime.verdict === "same"
      ? `${shortRuntimeHash(runtime.live)}${builderAge ? ` (${builderAge})` : ""} — the live scene already runs this code`
      : runtime.verdict === "will-update"
        ? `the live scene runs older code${liveAge ? ` (${liveAge})` : ""} — publishing updates it${builderAge ? ` to today's` : ""}`
        : runtime.verdict === "builder-behind"
          ? `this Builder serves older code${builderAge ? ` (${builderAge})` : ""} than the live scene${liveAge ? ` (${liveAge})` : ""} — publishing would ROLL BACK its behaviour`
          : "unknown — the code fingerprint could not be read from both sides";

  // A stale Builder does not make the world unsafe to ENTER, so `jumpSafe` and
  // the headline are left alone. It makes it unsafe to PUBLISH, and `action` is
  // the line that tells you what to do.
  //
  // ★ PHRASED FOR SOMEONE WHO DOES NOT OWN THE BUILDER. It used to say "update
  // this Builder first", which is an instruction only the operator can carry
  // out — and every visitor who builds a scene here is using somebody else's
  // Builder. The advice has to be something the reader can actually do.
  const action =
    runtime.verdict === "builder-behind"
      ? `Hold off publishing — ${runtimeHeadline(runtime)} It will be safe once this Builder is updated. (Then: ${base.action})`
      : base.action;

  return {
    ...base,
    action,
    copies: { ...base.copies, runtime: { label: "Scene code", detail } },
    runtime,
  };
}
