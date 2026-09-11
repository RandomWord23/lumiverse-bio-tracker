# Arousal & Climax Mechanics Redesign

## Problem Statement

The LLM narrates orgasms **before** the engine-computed `<Climax>` meter reaches 100%. The current system relies on the LLM "copying" the Climax value exactly, but nothing prevents the LLM from writing an orgasm scene whenever it sees high arousal. The engine computes the correct Climax value, but the LLM can still narrate an orgasm prematurely — there's no guardrail or explicit permission signal.

### Root Cause

1. **No explicit prohibition in the prompt**: The prompt says "copy the Climax value exactly" but never says "do NOT narrate an orgasm unless Climax = 100."
2. **No permission signal**: The struggle system has event notifications ("THRESHOLD EVENT: Indigestion reached 25%") that tell the LLM *when* to narrate events. The climax system has no such signal — the LLM improvises.
3. **Arousal is too loosely coupled to Climax**: The LLM sets arousal freely (rule 16 says "set it to whatever you believe"), but the climax threshold is a hard cliff at 95. The LLM sees arousal=98, thinks "that's basically orgasm" and narrates it — even if Climax is only 25.

### Current Mechanics Summary

| Component | How it works | File/Line |
|-----------|-------------|-----------|
| Arousal (0-100) | LLM-set, engine subtracts 50%/hr decay | [`interceptor.ts:645-648`](../src/backend/interceptor.ts:645) |
| Climax (0-100) | Engine-computed: +25/turn if arousal ≥ 95, −25/turn if < 95 | [`interceptor.ts:661-665`](../src/backend/interceptor.ts:661) |
| Orgasm trigger | Climax ≥ 100 → set `pendingOrgasmReset`, expel cum, toast | [`interceptor.ts:668-731`](../src/backend/interceptor.ts:668) |
| Post-orgasm reset | Next turn: arousal = 0, climax = 0 | [`interceptor.ts:654-658`](../src/backend/interceptor.ts:654) |
| Balls feedback | +3 arousal per prey per turn | [`interceptor.ts:633`](../src/backend/interceptor.ts:633) |
| LLM prompt rules | Rules 16-18: arousal is LLM-set, climax is engine-computed, copy exactly | [`engine.ts:1104-1106`](../src/backend/engine.ts:1104) |

**Key flaw**: Climax rises +25/turn when arousal ≥ 95. That means it takes **4 turns** of sustained 95+ arousal to climax. But the LLM has no way to know "how many turns am I in" and no instruction to wait — so it narrates an orgasm on turn 1 or 2.

---

## Design Options

### Option 1: Prompt-Only Fix (Lowest Complexity)

**Concept**: Don't change any engine logic. Just add explicit, forceful instructions to the LLM prompt that:
- Define what each Climax value range *means* narratively
- Explicitly prohibit narrating an orgasm unless Climax = 100
- Add a "edging" narrative cue when Climax is high but not yet 100

**Changes required**:
- [`engine.ts`](../src/backend/engine.ts) `buildSheetPrompt()` — rewrite rules 16-17 with stronger guardrails

**New prompt text for rules 16-17**:

```
16. <Arousal> is a 0-100 meter. Set it to the value you believe reflects the
character's current arousal based on the scene. The extension AUTOMATICALLY
subtracts natural decay (50%/hour) from whatever value you set — so to keep
arousal high during intimate scenes, set it HIGHER than the current value to
compensate for decay. After a climax, arousal is reset to 0 by the engine.
Do NOT immediately crank it back up — let it build gradually.

17. <Climax> is a 0-100 meter computed by the extension from <Arousal>. Copy
the value from the sheet exactly — do NOT change it yourself. The climax meter
rises +25 per turn while arousal stays at 95+, and falls -25 per turn when
arousal drops below 95. This means it takes 4 turns of sustained high arousal
to reach climax.

CLIMAX NARRATION RULES — CRITICAL:
- Climax 0-24: No climax tension. The character is aroused but not close.
- Climax 25-49: Building tension. Describe growing arousal, breathing
  getting heavier, body responding more intensely.
- Climax 50-74: High tension. Describe being close, struggling to hold back,
  body trembling, on the edge. Use words like "close," "almost there,"
  "can't hold it" — but do NOT climax yet.
- Climax 75-99: Edge. The character is right at the precipice. Describe
  desperate edging, trembling, barely holding on. This is the MAXIMUM tension
  before orgasm. Do NOT narrate an orgasm at this stage — the character is
  fighting to hold on (or failing to hold on is the orgasm, which only
  happens at 100).
- Climax 100: ORGASM. The character climaxes. Narrate the full orgasm scene
  with release. This is the ONLY time you may narrate an orgasm or
  ejaculation. After this, the engine resets arousal to 0 next turn.

NEVER narrate an orgasm, ejaculation, or climax scene unless <Climax> is
exactly 100. If Climax is 75 or 99, the character is CLOSE but has NOT
climaxed. Narrate the tension and edging — not the release.
```

**Pros**:
- Zero code changes, zero risk of breaking the engine
- Can be deployed immediately
- Easy to iterate on the wording

**Cons**:
- LLMs are unreliable at following negative instructions ("do NOT climax")
- The LLM might still narrate an orgasm if it sees arousal=100 and climax=50
- No mechanical enforcement — purely advisory

---

### Option 2: Climax Event Notification System (Medium Complexity)

**Concept**: Follow the exact pattern already used by the Struggle Engine. The engine generates a **CLIMAX EVENT** notification when climax reaches 100 (and optionally an "approaching" notification at 75+). This notification is injected into the LLM prompt the same way struggle events are. The LLM is told: **only narrate an orgasm when you receive a CLIMAX EVENT notification.**

This is the same proven pattern as [`interceptor.ts:1269-1287`](../src/backend/interceptor.ts:1269) (struggle events) and [`interceptor.ts:1307-1309`](../src/backend/interceptor.ts:1307) (prompt injection).

**Changes required**:

1. **[`interceptor.ts`](../src/backend/interceptor.ts) — In the climax block (~line 668)**:
   When `finalClimax >= 100`, instead of (or in addition to) the current logic, set a chat variable:
   ```typescript
   await spindle.variables.chat.set(chatId, 'pendingClimaxEvent', JSON.stringify({
     type: 'orgasm',
     cumExpelled: cumVol,
     forceConvertedCount: forceConvertedCount,
   }))
   ```

   Also, when `finalClimax >= 75 && finalClimax < 100`, set an "edging" notification:
   ```typescript
   await spindle.variables.chat.set(chatId, 'pendingClimaxEvent', JSON.stringify({
     type: 'edging',
     climaxValue: finalClimax,
   }))
   ```

2. **[`interceptor.ts`](../src/backend/interceptor.ts) — In the prompt injection section (~line 1269)**:
   Add a new block after the struggle notification:
   ```typescript
   let climaxNotification = ''
   const pendingClimaxEvent = await spindle.variables.chat.get(chatId, 'pendingClimaxEvent')
   if (pendingClimaxEvent) {
     await spindle.variables.chat.delete(chatId, 'pendingClimaxEvent')
     try {
       const event = JSON.parse(pendingClimaxEvent)
       if (event.type === 'orgasm') {
         climaxNotification =
           '\n\n─── CLIMAX EVENT ───\n' +
           'ORGASM TRIGGERED. The character has reached climax. Narrate the full orgasm/ejaculation scene now. ' +
           `Cum expelled: ${event.cumExpelled}ml${event.forceConvertedCount > 0 ? `, ${event.forceConvertedCount} force-converted prey` : ''}.` +
           '\n\nThis event is for NARRATION ONLY. The Climax value in the sheet is already set to 100. Copy it exactly. Next turn, the engine will reset arousal and climax to 0.'
       } else if (event.type === 'edging') {
         climaxNotification =
           '\n\n─── CLIMAX EVENT ───\n' +
           `EDGING. Climax meter at ${event.climaxValue}%. The character is on the edge — describe intense tension, trembling, barely holding on. Do NOT narrate an orgasm yet — the character has not climaxed. Wait for the ORGASM TRIGGERED notification.`
       }
     } catch { /* ignore */ }
   }
   ```

   Then add to the injection:
   ```typescript
   content: buildSheetPrompt(sheet) + populateInstructions + struggleNotification + climaxNotification + dicePoolInjection,
   ```

3. **[`engine.ts`](../src/backend/engine.ts) — `buildSheetPrompt()` rules 16-17**:
   Update the prompt to tell the LLM about the CLIMAX EVENT system:
   ```
   17. <Climax> is a 0-100 meter computed by the extension. Copy it exactly.
   
   CLIMAX EVENT SYSTEM:
   The extension sends CLIMAX EVENT notifications to tell you when to narrate
   climax-related events. Follow them exactly:
   
   - "EDGING" (Climax 75-99): Narrate intense tension and being on the edge.
     Do NOT narrate an orgasm — the character has NOT climaxed yet.
   - "ORGASM TRIGGERED" (Climax 100): Narrate the full orgasm/ejaculation
     scene. This is the ONLY time you may narrate an orgasm.
   
   If you do NOT see a CLIMAX EVENT notification, do NOT narrate an orgasm.
   If you see an EDGING notification, describe high tension but NO release.
   If you see an ORGASM TRIGGERED notification, narrate the orgasm.
   
   The Climax meter rises +25 per turn while arousal stays at 95+, and falls
   -25 per turn when arousal drops below 95. It takes 4 turns of sustained
   high arousal to reach climax.
   ```

**Pros**:
- Uses the proven event notification pattern already in the codebase
- The LLM gets an explicit "you may now narrate an orgasm" signal
- The edging notification gives the LLM narrative guidance for the pre-climax phase
- Moderate code changes, well-contained

**Cons**:
- Still relies on the LLM respecting the notification — but this is much stronger than a prompt rule
- One-turn delay: the event is set during the tick (after the LLM response), and delivered on the next prompt. This is actually the existing pattern — the orgasm will be narrated on the turn AFTER climax reaches 100. This is arguably correct (the engine sets climax=100, the LLM narrates it next turn).

**Timing flow**:
```
Turn N: LLM sets arousal high → tick runs → climax rises → if climax hits 100,
         pendingClimaxEvent = {type:'orgasm'} is set → arousal/climax reset
         happens NEXT turn via pendingOrgasmReset
Turn N+1: Prompt includes "ORGASM TRIGGERED" notification → LLM narrates the
          orgasm → pendingOrgasmReset fires → arousal=0, climax=0

Wait — there's a timing issue. pendingOrgasmReset fires on turn N+1, which
means the LLM sees the ORGASM notification AND the reset on the same turn.
That's correct — the LLM narrates the orgasm this turn, and the reset happens
so next turn arousal/climax are 0.
```

---

### Option 3: Redesigned Climax Curve + Edging Mechanics (Medium-High Complexity)

**Concept**: Replace the simple +25/−25 cliff threshold with a more nuanced system:
- **Arousal bands**: Arousal 0-30 = "calm", 31-70 = "aroused", 71-90 = "highly aroused", 91-100 = "edge zone"
- **Climax accumulation**: Climax rises proportionally to how high arousal is, not just a flat +25 above 95. This makes the system feel more organic — high arousal builds climax faster than moderate arousal.
- **Edging plateau**: When arousal is in the 91-99 range for multiple turns, the climax meter slows down (the character is "edging" — holding on at the edge). This creates a natural tension plateau.
- **Orgasm trigger**: Only at climax = 100, with the event notification from Option 2.

**Climax accumulation formula** (replaces the current +25/−25):
```typescript
if (finalArousal >= 95) {
  // Full speed — climax rises fast
  finalClimax = Math.min(100, finalClimax + 30)
} else if (finalArousal >= 80) {
  // High arousal — climax builds steadily
  finalClimax = Math.min(100, finalClimax + 15)
} else if (finalArousal >= 60) {
  // Moderate arousal — climax builds slowly
  finalClimax = Math.min(100, finalClimax + 5)
} else if (finalArousal >= 30) {
  // Low arousal — climax holds steady
  // no change
} else {
  // Calm — climax decays
  finalClimax = Math.max(0, finalClimax - 10)
}
```

**Changes required**: Same as Option 2, plus:
4. **[`interceptor.ts`](../src/backend/interceptor.ts) climax block (~line 661-665)**: Replace the flat +25/−25 with the banded formula above.
5. **[`engine.ts`](../src/backend/engine.ts) prompt**: Update the arousal/climax rules to describe the bands.

**Pros**:
- More organic feel — climax builds gradually at moderate arousal, rapidly at high arousal
- The 80-94 range becomes a meaningful "building" zone rather than a dead zone
- Creates natural narrative pacing: warm-up → building → edging → orgasm

**Cons**:
- More complex to tune — the bands and rates need playtesting
- The LLM needs to understand the bands, which adds prompt complexity
- Balls feedback (+3/prey/turn) interacts differently with the new bands

---

### Option 4: Multi-Phase Climax State Machine (Highest Complexity)

**Concept**: Replace the single Climax meter with a state machine that tracks distinct phases. Each phase has different mechanical effects on the simulation.

**States**:
1. **`calm`** (arousal 0-30): No climax progress. Normal simulation.
2. **`aroused`** (arousal 31-70): Climax slowly accumulates. Conversion speed in balls increases slightly.
3. **`edge`** (arousal 71-99, climax < 100): Climax accumulates faster. The character is visibly aroused. Conversion speed in balls is significantly boosted. Edging notifications fire at 75, 90.
4. **`climax`** (climax = 100): Orgasm triggers. Full force-conversion of balls prey. Cum expelled. State transitions to `refractory` next turn.
5. **`refractory`** (post-orgasm, 1-3 turns): Arousal is locked to 0 (or very low). Climax is 0. The character cannot become aroused. Conversion in balls is paused. After the refractory period, state returns to `calm`.

**New sheet fields**:
- `<ClimaxPhase>` — the current phase string (`calm`, `aroused`, `edge`, `climax`, `refractory`)
- `<RefractoryTurns>` — remaining turns in refractory state

**Changes required**: Same as Option 3, plus:
6. **[`interceptor.ts`](../src/backend/interceptor.ts)**: Full phase transition logic, refractory countdown, arousal lock during refractory.
7. **[`engine.ts`](../src/backend/engine.ts)**: Prompt rules for the phase system, refractory behavior.
8. **[`state.ts`](../src/backend/state.ts)**: Possibly a new toggle for the refractory system.
9. **[`types.ts`](../src/backend/types.ts)**: New interfaces for climax state.

**Pros**:
- Most immersive — the refractory period creates realistic post-orgasm dynamics
- The phase system gives the LLM clear narrative cues ("you're in the edge phase, describe tension")
- Mechanical effects on conversion speed make arousal meaningful beyond just the climax meter

**Cons**:
- Most complex to implement and debug
- Refractory period could feel restrictive if the LLM wants to continue the scene
- Many edge cases (what if arousal is forced high during refractory by magic? what if prey is added to balls during refractory?)

---

## Recommendation

**Option 2 (Climax Event Notification System)** is the recommended approach. It directly addresses the root cause (no permission signal for the LLM) using a proven pattern already in the codebase (struggle events). It's low-to-medium risk, well-contained, and can be combined with the prompt strengthening from Option 1 for a belt-and-suspenders approach.

If the user wants a more organic feel, **Option 2 + Option 3** (notification system + banded climax curve) is the sweet spot — the notifications fix the premature narration problem, and the banded curve makes the build-up feel more natural than a cliff at 95.

Option 4 is interesting but adds significant complexity for a relatively niche benefit (refractory period). It could be a future enhancement.

## Implementation Priority

1. **Option 1** (prompt fix) — can be done immediately, zero risk
2. **Option 2** (event notifications) — the core fix, uses existing patterns
3. **Option 3** (banded curve) — optional enhancement for better feel
4. **Option 4** (state machine) — future enhancement, not needed for the core fix
