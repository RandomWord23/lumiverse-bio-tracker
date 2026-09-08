# Climax Force-Conversion — Architectural Design

## Objective

When the predator climaxes (orgasm triggers at `Climax ≥ 100`), **all prey currently inside the `<Balls>` are immediately force-converted to cum and expelled along with any already-accumulated `CumVolume_ml`.** The orgasm becomes a "finisher" — it churns everything remaining and blasts it all out at once.

This is a small, surgical change to the existing climax block in [`runDigestionTick`](src/backend/interceptor.ts:56). No new XML tags, no new engine toggles, no new types.

---

## Current Architecture

### Tick Order (inside `runDigestionTick`)

```
1. Stomach digestion      (interceptor.ts ~line 200)
2. Bowels transit         (interceptor.ts ~line 350)
3. Womb absorption         (interceptor.ts ~line 394)
4. Balls conversion       (interceptor.ts ~line 458)  ← progresses conversion%, removes 100% prey, adds to CumVolume_ml
5. Struggle               (interceptor.ts ~line 598)
6. Arousal/Climax          (interceptor.ts ~line 613)  ← climax meter, orgasm trigger, expels CumVolume_ml
7. Nutrient absorption    (interceptor.ts ~line 699)
```

### Current Climax Block (interceptor.ts lines 658–674)

```typescript
// Trigger orgasm!
if (finalClimax >= 100) {
  finalClimax = 100
  await spindle.variables.chat.set(chatId, 'pendingOrgasmReset', 'true')

  // Expel cum on climax
  if (engineToggles.cockVoreEngine) {
    const cumVol = getStat(updatedXml, 'CumVolume_ml') || 0
    if (cumVol > 0) {
      maybeToast('climaxEvents', 'success', `💦 Climax expelled ${cumVol.toFixed(0)} ml of cum!`)
      spindle.log.info(`[runDigestionTick] Climax expelled ${cumVol}ml cum`)
      updatedXml = setStat(updatedXml, 'CumVolume_ml', 0)
    }
  }

  maybeToast('climaxEvents', 'success', '🔥 Climax reached! Resetting next turn.')
  spindle.log.info('Climax event triggered.')
}
```

**Problem:** The climax only expels *already-accumulated* cum (from prey that reached 100% conversion during the normal tick). Prey still mid-churn (e.g., 45% conversion) are completely unaffected by the orgasm. Narratively, this feels wrong — the orgasm should be the ultimate "finisher."

---

## Design

### Change: Force-convert remaining balls prey on climax

When `finalClimax >= 100` and `engineToggles.cockVoreEngine` is on, **before** expelling cum:

1. Re-read `<Balls>` content from `updatedXml`
2. Find all `<Item type="Prey" ...>` entries still in the balls
3. For each remaining prey:
   - Add their `volume_L × 1000` to `CumVolume_ml` (same 1:1 L→ml ratio as normal conversion)
   - Remove them from the balls content (they're fully churned)
4. Write the emptied `<Balls>` back into `updatedXml`
5. Then expel the total `CumVolume_ml` (now including force-converted prey) as normal
6. Toast: `💦 Climax force-converted N prey and expelled X ml of cum!`

### Pseudocode (replaces the existing climax cum-expulsion block)

```typescript
// Expel cum on climax
if (engineToggles.cockVoreEngine) {
  let forceConvertedCount = 0
  let forceConvertedVol = 0

  // Force-convert all remaining balls prey
  const ballsMatch = updatedXml.match(/<Balls([^>]*)>([\s\S]*?)<\/Balls>/i)
  if (ballsMatch) {
    const ballsAttrs = ballsMatch[1]
    const ballsInner = ballsMatch[2]
    const preyRegex = /<Item\s+([^>]*type="Prey"[^>]*)\s*(?:\/\s*>|>([\s\S]*?)<\/Item>)/gi
    let preyMatch: RegExpExecArray | null
    while ((preyMatch = preyRegex.exec(ballsInner)) !== null) {
      const preyAttrs = preyMatch[1]
      const vol = parseFloat(getAttrFromString(preyAttrs, 'volume_L') || '0') || 0
      forceConvertedCount++
      forceConvertedVol += vol * 1000 // L → ml
    }

    if (forceConvertedCount > 0) {
      // Remove all prey items from balls content
      const emptiedBallsInner = ballsInner.replace(
        /<Item\s+[^>]*type="Prey"[^>]*\s*(?:\/\s*>|>([\s\S]*?)<\/Item>)/gi,
        '',
      ).replace(/^\s*\n/gm, '').trim()

      updatedXml = updatedXml.replace(
        /<Balls([^>]*)>[\s\S]*?<\/Balls>/i,
        `<Balls${ballsAttrs}>\n${emptiedBallsInner}\n    </Balls>`,
      )

      // Add force-converted volume to CumVolume_ml
      const oldCumVol = getStat(updatedXml, 'CumVolume_ml') || 0
      updatedXml = setStat(updatedXml, 'CumVolume_ml', oldCumVol + forceConvertedVol)

      spindle.log.info(
        `[runDigestionTick] Climax force-converted ${forceConvertedCount} prey, +${forceConvertedVol}ml cum`,
      )
    }
  }

  // Now expel all accumulated cum
  const cumVol = getStat(updatedXml, 'CumVolume_ml') || 0
  if (cumVol > 0) {
    if (forceConvertedCount > 0) {
      maybeToast(
        'climaxEvents',
        'success',
        `💦 Climax force-converted ${forceConvertedCount} prey and expelled ${cumVol.toFixed(0)} ml of cum!`,
      )
    } else {
      maybeToast('climaxEvents', 'success', `💦 Climax expelled ${cumVol.toFixed(0)} ml of cum!`)
    }
    spindle.log.info(`[runDigestionTick] Climax expelled ${cumVol}ml cum`)
    updatedXml = setStat(updatedXml, 'CumVolume_ml', 0)
  }
}
```

### What stays the same

- **No new XML tags** — prey are simply removed from `<Balls>` (same as normal 100% conversion)
- **No new engine toggles** — uses existing `cockVoreEngine`
- **No new types** — no changes to [`types.ts`](src/backend/types.ts)
- **No new engine functions** — all logic is inline in the climax block
- **No changes to [`convertItemsInContent`](src/backend/engine.ts:828)** — the normal per-tick conversion still runs first; force-conversion only happens at the climax moment
- **No changes to the LLM prompt** — the LLM doesn't need to know about force-conversion; it just sees an empty `<Balls>` and `CumVolume_ml = 0` after the climax tick, which is the same state it already sees after a normal climax expulsion

### Edge cases

| Case | Behavior |
|---|---|
| No prey in balls, but CumVolume_ml > 0 | Same as current — just expels accumulated cum. Toast uses the old message. |
| Prey in balls, CumVolume_ml = 0 | Force-converts prey, then expels. Toast uses the force-conversion message. |
| Prey in balls AND CumVolume_ml > 0 | Force-converts prey (adds to CumVolume_ml), then expels total. Toast uses the force-conversion message. |
| `cockVoreEngine` off | Entire block skipped — no change from current behavior. |
| Balls tag missing entirely | `ballsMatch` is null, force-conversion skipped, normal cum expulsion runs. |

### Interaction with the arousal feedback loop

The arousal feedback loop (lines 619–629) runs **before** the climax meter calculation. It adds `+3 × preyCount` to arousal. This means:

- Prey in balls → arousal rises → climax triggers sooner → force-conversion happens
- After force-conversion, prey are gone → next tick has no prey → arousal feedback stops → arousal decays

This is the correct behavior — the feedback loop naturally resolves itself through the climax.

### Interaction with the post-orgasm reset

The `pendingOrgasmReset` flag (line 660) causes arousal and climax to reset to 0 on the **next** tick. Force-conversion happens on the **same** tick as the climax trigger, so:

- Tick N: Climax triggers → force-convert prey → expel cum → set `pendingOrgasmReset`
- Tick N+1: `pendingOrgasmReset` detected → arousal = 0, climax = 0 → balls are empty, no prey to convert

This is clean — no race conditions.

---

## Implementation Steps

1. **Edit [`interceptor.ts`](src/backend/interceptor.ts) climax block** (lines 662–670) — replace the existing cum-expulsion logic with the force-conversion + expulsion logic shown above
2. **Test** — verify with prey at various conversion levels that climax force-converts them all and expels the correct total

That's it. One file, one block, ~30 lines of new code.

---

## Files Touched

| File | Change |
|---|---|
| [`src/backend/interceptor.ts`](src/backend/interceptor.ts) | Replace climax cum-expulsion block (lines 662–670) with force-conversion + expulsion logic |

No other files need changes.
