/**
 * Full-screen arrival cover — a cloudscape you fall into, not a black slate.
 *
 * THE BACKGROUND IS BRIGHT, SO EVERY GLYPH IS INK. The sky plate measures
 * luminance 0.90–0.98 across the exact band this stack occupies (title at −160 px
 * through the button at +160 px), so white text — what this cover used to draw —
 * is invisible on it. Ink navy is not a style choice here, it is the only legible
 * option, and it is why nothing below uses HUD_WHITE.
 *
 * THE OPAQUE BACKING IS LOAD-ORDER INSURANCE. A texture arrives asynchronously;
 * on the first frames it is nothing at all. The cover's whole job is to hide the
 * Explorer's own loading bar, so the root paints a solid sky colour and the
 * photograph layers on top of it. Without that backing the first second of every
 * arrival showed two progress bars racing each other.
 */
import ReactEcs, { Label, UiEntity } from "@dcl/sdk/react-ecs";
import { Color4 } from "@dcl/sdk/math";
import { panelBg } from "../ui-kit";
import { canvasSize, isCompact, px, textPx } from "../ui/kit";
import { enterLandingWorld, isLandingCoverVisible, landingHud } from "./landing";
import { keepFlying } from "../scene-offer";
import {
  LANDING_ARENA_ART,
  LANDING_ARENA_BOX,
  landingArenaStack,
} from "@shared/landing-contract";
import { PUNCH_UI } from "./punch-visual-theme";

const SKY_TEX = "images/landing/sky.jpg";
const VEIL_TEX = "images/landing/cloud-veil.png";

/**
 * THE ARENA PLATE IS THE AUTHORED BANNER, NOT THE RED RETURN CAPSULE.
 *
 * `btn-enter-arena.png` was drawn for this screen — the publish allowlist has
 * said so in a comment since the day it shipped — and the cover was drawing
 * `float-button.png` instead: the in-game FLOAT BACK UP control, a red enamel
 * capsule in brass, with ENTER THE ARENA typed over it in live text. Two
 * consequences, and the owner named both. The words were a system font on a
 * screen where every other glyph is drawn; and a saturated red-and-brass
 * capsule under an ice-blue wordmark is a third material in a stack that only
 * ever had room for one. The banner carries its own lettering, so the Label
 * goes with it. Measured off the export (1024x341).
 */
const ARENA_TEX = "images/punch/btn-enter-arena.png";

/**
 * The venue's authored wordmark, drawn where the title text would be.
 *
 * Same gate as the arena plate: a venue with no logo keeps the type it has
 * always had, and this is the punch championship's. `hud.title` stays set to
 * the same words — it is what shows if the texture is slow, and the name the
 * rest of the product still calls the place.
 *
 * ‼️IT IS A BADGE NOW, NOT A PLATE. The old wordmark was HIGH GROUND inside a
 * long rounded capsule, which put THREE stacked capsules on the cover — plate,
 * loading bar, button — of three different materials, and said nothing about
 * what the venue is. The badge is the same lettering and the same gold star
 * with a red glove on a chrome arm punching out through the frame: the machine
 * the whole place is built around, in the silhouette of a badge rather than a
 * fourth horizontal bar. Measured off the export (900x739) so it is never
 * squashed; `logo-high-ground-machine.png` is the alternative lockup, kept in
 * the tree and deliberately NOT in the publish allowlist.
 */
const LOGO_TEX = "images/punch/logo-high-ground.png";

/**
 * THE ARRIVAL METER IS THE GAME'S OWN CLOUD SHELF.
 *
 * `meter-cloud.png` and `meter-fill-boost.png` are the shelf and fill the HUD
 * already draws over the fight, and they were sitting in the publish allowlist
 * unused by this screen. Everything about the flat bar this replaces was wrong
 * for a bright sky: it was assembled from rectangles under two fully rendered
 * cartoon plates, and its fill ramped to `PUNCH_UI.ink` #132F35, so a FINISHED
 * bar — the state a visitor stares at while deciding to click — was a black
 * slab. Reusing the shelf makes the arrival and the game one kit, and costs no
 * new bytes in the bundle.
 */
const SHELF_TEX = "images/punch/meter-cloud.png";
const FILL_TEX = "images/punch/meter-fill-boost.png";
/**
 * The groove inside the shelf art, as shares of its box — the same fractions
 * `punch-machine-ui.tsx` reads for the focus meter. Re-export the art and the
 * layout moves with it.
 */
const GROOVE_L = 0.085;
const GROOVE_T = 0.35;
const GROOVE_W = 0.83;
const GROOVE_H = 0.3;
/**
 * The empty part of the groove, and it is ICE rather than the HUD's dark ink.
 *
 * In the game the shelf sits over a fight, where a dark track is the contrast.
 * Here it sits on a sky that measures 0.90–0.98 luminance, and the first cut
 * with the HUD's ink read as a grey slot cut out of a white cloud — the same
 * mistake as the black bar, one size smaller.
 */
const TRACK_ICE = Color4.create(0.84, 0.925, 0.98, 1);

/** Sampled from the plate's centre — what shows for the frames before it loads. */
const SKY_BACKING = Color4.create(0.83, 0.94, 0.99, 1);

const INK = Color4.create(0.055, 0.185, 0.305, 1);
const INK_SOFT = Color4.create(0.173, 0.373, 0.541, 1);

/**
 * Both ends of the ramp are STRONG blue. The first cut lerped from a pale sky
 * tint, and against a white track on a white-ish sky the fill simply vanished at
 * low percentages — the meter read as empty while it was a third full.
 */
const FILL_LOW = { r: 0.2, g: 0.6, b: 0.92 };
const FILL_HIGH = { r: 0.04, g: 0.38, b: 0.76 };

const BAR_W_DESIGN = 620;
const BAR_H_DESIGN = 56;

/**
 * The arrival cover is the first thing a phone sees, so it cannot be a fixed
 * 620 px slab: on a narrow canvas that runs off both edges and the loading bar
 * loses its ends. Width is taken from the canvas with a margin, and the whole
 * panel scales with it — floors keep the bar from collapsing to a hairline.
 */
function coverWidth(): number {
  const { width } = canvasSize();
  const target = px(BAR_W_DESIGN * (isCompact() ? 1.35 : 1));
  const room = width - Math.max(28, px(56)) * 2;
  return Math.max(240, Math.min(target, room));
}
function barHeight(): number {
  return Math.max(34, px(BAR_H_DESIGN));
}

/**
 * A line box that CANNOT be smaller than the words in it.
 *
 * Every row on this cover carried a hand-picked height sitting next to a font
 * size chosen somewhere else, and the two drifted apart the moment anything
 * scaled — which is the whole of "the caption is sitting on the loading bar"
 * and "READY WHEN YOU ARE is sitting on the ENTER button". Not a margin to
 * nudge: a box the text had already outgrown. Deriving the height from the font
 * makes both impossible at any size.
 */
function lineBox(fontPx: number): number {
  return Math.round(fontPx * 1.5);
}

/** Vertical rhythm, with a floor so the stack never closes up. */
function gap(design: number): number {
  return Math.max(6, px(design));
}

/**
 * The rim is a HAIRLINE FRAME, not a second track.
 *
 * At 6 px the fill covered two thirds of the bar and the white above it read as
 * "still loading" at 100%; at 3 px, with a gloss over the top third, the solid
 * part of the fill was still only about half the height of the thing it sits
 * in. The frame is now the thinnest line that still detaches the bar from a
 * near-white sky, and the fill has the rest.
 */
const BAR_PAD = 2;

function withAlpha(color: Color4, alpha: number): Color4 {
  return Color4.create(color.r, color.g, color.b, alpha);
}

/**
 * ‼️THE ARENA RAMP IS GONE, AND IT IS NOT COMING BACK AS A PARAMETER.
 *
 * This used to take an `arena` flag and lerp petrol → `PUNCH_UI.ink`, which is
 * #132F35: a full championship bar was a black slab on a white sky. A
 * championship draws `shelfBar` now, so the only thing a flag here could do is
 * restore that. Both ends stay STRONG blue for everyone else — the first cut
 * lerped from a pale sky tint and the fill vanished at low percentages, so the
 * meter read as empty while it was a third full.
 */
function fillColor(fraction: number, alpha: number): Color4 {
  const t = Math.max(0, Math.min(1, fraction));
  const low = FILL_LOW;
  const high = FILL_HIGH;
  return Color4.create(
    low.r + (high.r - low.r) * t,
    low.g + (high.g - low.g) * t,
    low.b + (high.b - low.b) * t,
    alpha,
  );
}

/**
 * The arrival meter. Deliberately NOT the fight kit's bar: that geometry is
 * 250 px of dark arcade chrome tuned to sit over a fight, and on an open sky it
 * reads as a splinter. This one is more than twice as wide, rounded, and built
 * from sky colours so it belongs to the picture behind it.
 */
function cloudBar(fraction: number, alpha: number, pulse: number) {
  const BAR_W = coverWidth();
  const BAR_H = barHeight();
  const clamped = Math.max(0, Math.min(1, fraction));
  const innerW = BAR_W - BAR_PAD * 2;
  const innerH = BAR_H - BAR_PAD * 2;
  const fillW = Math.round(innerW * clamped);
  // A SHEEN, NOT A SECOND BAND. A bright strip over a third of the fill draws
  // its own edge across the bar, and the eye reads everything above that edge
  // as empty track — which is how a full bar looked half full.
  const glossH = Math.max(2, Math.round(innerH * 0.22));
  // NO NUMBER, AND NO CAPTION ROW. A percentage on an arrival meter is a promise
  // about time that nothing here can keep — assets arrive out of order, so it
  // climbed to 100 and dropped back — and the stage name was already printed in
  // full under the bar. One honest line, once, below the meter.
  return (
    <UiEntity uiTransform={{ width: BAR_W, flexDirection: "column", pointerFilter: "none" }}>
      <UiEntity uiTransform={{ width: BAR_W, height: BAR_H, pointerFilter: "none" }}>
        {/* Soft ink rim: the bar has to detach from a near-white sky. */}
        <UiEntity
          key="landing-bar-rim"
          uiTransform={{
            positionType: "absolute",
            position: { left: 0, top: 0 },
            width: BAR_W,
            height: BAR_H,
            pointerFilter: "none",
          }}
          uiBackground={panelBg(Color4.create(0.055, 0.185, 0.305, 0.28 * alpha))}
        />
        <UiEntity
          key="landing-bar-track"
          uiTransform={{
            positionType: "absolute",
            position: { left: BAR_PAD, top: BAR_PAD },
            width: innerW,
            height: innerH,
            pointerFilter: "none",
          }}
          uiBackground={panelBg(Color4.create(1, 1, 1, 0.78 * alpha))}
        />
        {fillW > 0 ? (
          <UiEntity
            key="landing-bar-fill"
            uiTransform={{
              positionType: "absolute",
              position: { left: BAR_PAD, top: BAR_PAD },
              width: fillW,
              height: innerH,
              pointerFilter: "none",
            }}
            uiBackground={panelBg(fillColor(clamped, alpha))}
          />
        ) : null}
        {fillW > 0 ? (
          <UiEntity
            key="landing-bar-gloss"
            uiTransform={{
              positionType: "absolute",
              position: { left: BAR_PAD, top: BAR_PAD },
              width: fillW,
              height: glossH,
              pointerFilter: "none",
            }}
            uiBackground={panelBg(Color4.create(1, 1, 1, (0.13 + 0.32 * pulse) * alpha))}
          />
        ) : null}
      </UiEntity>
    </UiEntity>
  );
}

/**
 * The arrival meter for a championship: the HUD's cloud shelf, with the fill
 * CLIPPED in its groove rather than stretched to the level.
 *
 * The clipper's WIDTH is the level and the texture inside it keeps the FULL
 * groove width, so the fill's own gloss stays where the artist put it. A
 * texture stretched to the level slides its highlight along the bar as it
 * climbs, which reads as sloshing rather than filling — and the clip gives the
 * leading edge a square end for free, so "how far along is it" is a straight
 * line to read rather than a dome to guess at.
 */
function shelfBar(width: number, fraction: number, alpha: number) {
  const height = Math.round(width / LANDING_ARENA_ART.shelf);
  const gx = Math.round(width * GROOVE_L);
  const gy = Math.round(height * GROOVE_T);
  const gw = Math.round(width * GROOVE_W);
  const gh = Math.round(height * GROOVE_H);
  const cut = Math.round(gw * Math.max(0, Math.min(1, fraction)));
  return (
    <UiEntity uiTransform={{ width, height, pointerFilter: "none" }}>
      <UiEntity
        key="landing-shelf-track"
        uiTransform={{
          positionType: "absolute",
          position: { left: gx, top: gy },
          width: gw,
          height: gh,
          borderRadius: Math.round(gh / 2),
          pointerFilter: "none",
        }}
        uiBackground={{ color: withAlpha(TRACK_ICE, alpha) }}
      />
      {cut > 0 ? (
        <UiEntity
          key="landing-shelf-clip"
          uiTransform={{
            positionType: "absolute",
            position: { left: gx, top: gy },
            width: cut,
            height: gh,
            overflow: "hidden",
            pointerFilter: "none",
          }}
        >
          <UiEntity
            uiTransform={{
              positionType: "absolute",
              position: { left: 0, top: 0 },
              width: gw,
              height: gh,
              pointerFilter: "none",
            }}
            uiBackground={{
              texture: { src: FILL_TEX },
              textureMode: "stretch",
              color: Color4.create(1, 1, 1, alpha),
            }}
          />
        </UiEntity>
      ) : null}
      {/* The shelf goes on LAST: its slot is a transparent hole, so the track
          and the fill have to be under it rather than beside it. */}
      <UiEntity
        key="landing-shelf-frame"
        uiTransform={{
          positionType: "absolute",
          position: { left: 0, top: 0 },
          width,
          height,
          pointerFilter: "none",
        }}
        uiBackground={{
          texture: { src: SHELF_TEX },
          textureMode: "stretch",
          color: Color4.create(1, 1, 1, alpha),
        }}
      />
    </UiEntity>
  );
}

export function LandingRoot() {
  if (!isLandingCoverVisible()) return null;
  const hud = landingHud();
  if (!hud) return null;
  const a = hud.opacity;
  // A championship draws its badge instead of the title, so only a plain
  // venue ever reaches this ink; the status line below still takes the theme's.
  const ink = INK;
  const inkSoft = hud.arenaEntry ? PUNCH_UI.inkSoft : INK_SOFT;
  const veil = hud.veil;
  // Past this point the cover is only the veil: the world underneath is loaded,
  // the visitor is already walking, and every click must reach it.
  const covering = a > 0.02;
  // Every type size on the cover is decided ONCE, here, and every box under it
  // is derived from the size rather than guessed alongside it.
  const titleFont = textPx(52, 30);
  const subFont = textPx(18);
  const statusFont = textPx(17);
  const btnFont = textPx(21, 17);
  // ENTER is the one control on the screen, so it keeps a real thumb target on
  // the smallest canvas we support, and its rim scales with it.
  const btnW = Math.max(220, Math.min(px(288), coverWidth()));
  const btnH = Math.max(54, px(68));
  const btnRim = Math.max(3, px(4));
  // A championship's badge, shelf and plate are sized TOGETHER against the
  // height that exists; every other venue keeps the width-only layout it had.
  const arena = landingArenaStack({
    canvasH: canvasSize().height,
    room: coverWidth(),
    compact: isCompact(),
    statusH: lineBox(statusFont),
  });
  return (
    <UiEntity
      uiTransform={{
        width: "100%",
        height: "100%",
        positionType: "absolute",
        position: { top: 0, left: 0 },
        justifyContent: "center",
        alignItems: "center",
        pointerFilter: covering ? "block" : "none",
        zIndex: 900,
      }}
      uiBackground={{ color: withAlpha(SKY_BACKING, covering ? a : 0) }}
    >
      {covering ? (
        <UiEntity
          key="landing-sky"
          uiTransform={{
            positionType: "absolute",
            position: { top: 0, left: 0 },
            width: "100%",
            height: "100%",
            pointerFilter: "none",
          }}
          uiBackground={{
            texture: { src: SKY_TEX },
            textureMode: "stretch",
            color: Color4.create(1, 1, 1, a),
          }}
        />
      ) : null}

      {/*
        Drawn during the cover phase too, and that is deliberate: the veil is cut
        FROM the same plate, so while both are at full opacity it lays identical
        pixels over identical pixels and shows nothing. Suppressing it until the
        sky went would make the cloud frame pop into existence mid-fade.
      */}
      {veil > 0.02 ? (
        <UiEntity
          key="landing-veil"
          uiTransform={{
            positionType: "absolute",
            position: { top: 0, left: 0 },
            width: "100%",
            height: "100%",
            pointerFilter: "none",
          }}
          uiBackground={{
            texture: { src: VEIL_TEX },
            textureMode: "stretch",
            color: Color4.create(1, 1, 1, veil),
          }}
        />
      ) : null}

      {covering ? (
      <UiEntity
        uiTransform={{
          width: coverWidth(),
          flexDirection: "column",
          alignItems: "center",
          pointerFilter: "none",
        }}
      >
        {hud.arenaEntry ? (
          <UiEntity
            uiTransform={{
              width: arena.badgeW,
              height: arena.badgeH,
              margin: { bottom: hud.subtitle ? gap(6) : LANDING_ARENA_BOX.gapBadge },
              pointerFilter: "none",
            }}
            uiBackground={{
              texture: { src: LOGO_TEX },
              textureMode: "stretch",
              color: Color4.create(1, 1, 1, a),
            }}
          />
        ) : hud.title ? (
          <Label
            value={hud.title}
            fontSize={titleFont}
            color={withAlpha(ink, a)}
            textAlign="middle-center"
            uiTransform={{
              width: "100%",
              height: lineBox(titleFont),
              margin: { bottom: hud.subtitle ? gap(6) : gap(20) },
            }}
          />
        ) : null}
        {/* A venue that sets no subtitle gets none — no empty line holding space. */}
        {hud.subtitle ? (
          <Label
            value={hud.subtitle}
            fontSize={subFont}
            color={withAlpha(inkSoft, 0.9 * a)}
            textAlign="middle-center"
            uiTransform={{ width: "100%", height: lineBox(subFont), margin: { bottom: gap(20) } }}
          />
        ) : null}
        {hud.arenaEntry
          ? shelfBar(arena.shelfW, hud.fraction, a)
          : cloudBar(hud.fraction, a, hud.pulse)}
        <Label
          value={
            hud.canEnter
              ? hud.fallbackEntry
                ? `STILL LOADING ${hud.call}`
                : "READY WHEN YOU ARE"
              : hud.call === "READY"
                ? "ENTERING"
                : `LOADING ${hud.call}`
          }
          fontSize={statusFont}
          color={withAlpha(inkSoft, 0.92 * a)}
          textAlign="middle-center"
          uiTransform={{
            width: "100%",
            height: lineBox(statusFont),
            margin: { top: hud.arenaEntry ? LANDING_ARENA_BOX.gapShelf : gap(18) },
          }}
        />
        {hud.canKeepFlying ? (
          <UiEntity
            uiTransform={{
              width: Math.max(200, Math.min(px(248), coverWidth())),
              height: Math.max(48, px(56)),
              margin: { top: gap(14) },
              justifyContent: "center",
              alignItems: "center",
              pointerFilter: "block",
            }}
            uiBackground={panelBg(Color4.create(1, 1, 1, 0.72 * a))}
            onMouseDown={keepFlying}
          >
            <Label
              value="KEEP FLYING"
              fontSize={textPx(18, 15)}
              color={withAlpha(INK, a)}
              textAlign="middle-center"
              uiTransform={{ width: "100%", height: lineBox(textPx(18, 15)) }}
            />
          </UiEntity>
        ) : null}
        {hud.arenaEntry ? (
          /*
           * The banner carries its own lettering — no Label over the top of it.
           *
           * ‼️IT IS ALWAYS IN THE COLUMN, and INVISIBLE until the door opens.
           * Adding the button to the stack at the moment READY lands re-centres
           * everything above it: on a monitor the badge and the shelf jump 90 px
           * up the screen on the one frame the visitor is watching hardest, and
           * a cover whose whole job is to be still ends on a lurch. A box that
           * is already there, at alpha zero and deaf to the pointer, holds its
           * own place — which is also why `landingArenaStack` reserves its
           * height whether or not it is drawn.
           */
          <UiEntity
            uiTransform={{
              width: arena.plateW,
              height: arena.plateH,
              margin: { top: LANDING_ARENA_BOX.gapStatus },
              pointerFilter: hud.canEnter ? "block" : "none",
            }}
            uiBackground={{
              texture: { src: ARENA_TEX },
              textureMode: "stretch",
              color: Color4.create(1, 1, 1, hud.canEnter ? a : 0),
            }}
            onMouseDown={hud.canEnter ? enterLandingWorld : undefined}
          />
        ) : hud.canEnter ? (
          <UiEntity
            uiTransform={{
              width: btnW,
              height: btnH,
              margin: { top: gap(18) },
              justifyContent: "center",
              alignItems: "center",
              pointerFilter: "block",
            }}
            uiBackground={panelBg(Color4.create(0.055, 0.185, 0.305, 0.24 * a))}
            onMouseDown={enterLandingWorld}
          >
            <UiEntity
              uiTransform={{
                positionType: "absolute",
                position: { left: btnRim, top: btnRim },
                width: btnW - btnRim * 2,
                height: btnH - btnRim * 2,
                justifyContent: "center",
                alignItems: "center",
                pointerFilter: "none",
              }}
              uiBackground={panelBg(Color4.create(1, 1, 1, 0.93 * a))}
            >
              <Label
                value={hud.fallbackEntry ? "ENTER ANYWAY" : "ENTER WORLD"}
                fontSize={btnFont}
                color={withAlpha(INK, a)}
                uiTransform={{ width: "100%", height: lineBox(btnFont) }}
                textAlign="middle-center"
              />
            </UiEntity>
          </UiEntity>
        ) : null}
      </UiEntity>
      ) : null}
    </UiEntity>
  );
}
