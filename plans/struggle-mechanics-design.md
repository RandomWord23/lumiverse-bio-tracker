# Prey Struggle Mechanics — Design Document

## Overview

A struggle system that gives prey agency inside the stomach, creating dynamic tension between predator and prey. The extension handles all struggle math automatically (consistent with how digestion, arousal, and clothing stress are already handled). The LLM only sets willingness states and narrates.

The core mechanic is a **stomach-level Indigestion meter** (0–100%) that builds when prey struggle. At 100%, a **vomit event** triggers — the pred involuntarily throws up, and each prey has a **probabilistic chance to escape** based on how much they contributed to the struggle.

---

## Core Mechanics

### 1. Willingness States

Each prey item gets a `willingness` attribute. The LLM sets this based on narrative context.

| State | Digestion Speed | Indigestion Contribution | Energy Drain on Pred |
|-------|----------------|--------------------------|---------------------|
| **Willing** | +25% (×1.25) | None (willingnessFactor = 0) | None |
| **Reluctant** | Normal (×1.0) | Passive (willingnessFactor = 0.25) | Minimal |
| **Fighting** | −50% (×0.5) | Full active (willingnessFactor = 1.0) | Significant |

**Transition guidance for LLM** (suggested in prompt, not enforced):
- Willing → Reluctant: when digestion passes 30%, or pred does something threatening
- Reluctant → Fighting: when pred attacks/humiliates, or prey sees a chance
- Fighting → Reluctant: when suppression is sustained long enough (pred "breaks their spirit")
- Any → Willing: hypnosis, charm, mind-control, or genuine submission

### 2. Consciousness Factor

Derived from digestion %, controls how capable the prey is of struggling. Not a separate stat — calculated automatically.

| Digestion % | Consciousness Factor | Narrative State |
|------------|---------------------|-----------------|
| 0–50% | 1.0 (full capability) | Fully conscious, full strength |
| 50–70% | 0.5 (halved) | Weakening, skin tingling, movements sluggish |
| 70–85% | 0.1 (barely anything) | Desperate last thrashes, mostly dissolved |
| 85%+ | 0.0 (cannot struggle) | Unconscious/dissolving, no fight left |

When consciousnessFactor reaches 0, the prey contributes nothing to indigestion (too digested to fight).

### 3. Indigestion Meter (0–100%) — Stomach-Level

A single `indigestion` attribute on the `<Stomach>` tag (0–100). The extension manages this automatically per digestion tick. It represents the stomach's overall distress from struggling prey.

**Accumulation** (per prey that is fighting or reluctant, each tick):
```
indigestionGain += BaseIndigestionRate × elapsedHours × consciousnessFactor × sizeFactor × suppressionFactor × willingnessFactor × stomachResistanceFactor
```

Where:
- `BaseIndigestionRate` = 30 per hour (tuned for minute-scale RP — ~2.5 per 5 min per prey)
- `consciousnessFactor` = from table above
- `sizeFactor` = `min(2.0, preyVolume / stomachMaxCapacity)` — bigger prey relative to stomach = more indigestion
- `suppressionFactor` = active suppression: 0.3, passive: 0.7, exhausted (Energy=0): 1.0
- `willingnessFactor` = fighting: 1.0, reluctant: 0.25, willing: 0
- `stomachResistanceFactor` = `1.0 / StomachResistance` (see section 6)

Multiple prey stack indigestion — 3 fighting prey = 3× the gain.

**Decay** (when no prey is fighting — all willing/reluctant or stomach empty):
```
indigestionLoss = IndigestionDecayRate × elapsedHours × decayMultiplier
```

Where:
- `IndigestionDecayRate` = 20 per hour (~1.67 per 5 min)
- `decayMultiplier`: all willing = 2.0, some reluctant = 1.0

**Vomit condition**: `indigestion ≥ 100` → vomit event triggers (see section 7).

### 4. Size Factor

```
sizeFactor = min(2.0, preyVolume / stomachMaxCapacity)
```

Examples (stomach max = 115.2 L for 160cm/60kg pred with ×1.0 mult):
- Small prey (20 L): sizeFactor = 0.17 — weak struggles, barely noticeable
- Medium prey (65 L): sizeFactor = 0.56 — moderate pushing
- Same-size prey (115 L): sizeFactor = 1.0 — strong, dangerous struggles
- Oversized prey (200 L): sizeFactor = 1.73 — violent, stomach-warping thrashing

Larger prey are both harder to digest (more volume) and more dangerous (more indigestion), creating real risk for greedy preds.

### 5. Pred Suppression

**Two layers:**

**Passive suppression** (always active when Energy > 0):
- Reduces indigestion accumulation by 30% (suppressionFactor = 0.7)
- Represents the stomach's natural compressive strength
- No energy cost

**Active suppression** (LLM sets `suppressing="true"` on `<Stomach>` tag):
- Reduces indigestion accumulation by 70% (suppressionFactor = 0.3)
- Drains extra Energy: `numFightingPrey × 2 × elapsedHours`
- The LLM narrates the pred clenching stomach muscles, pressing down, etc.
- If Energy reaches 0, suppression fails entirely (suppressionFactor = 1.0)

**Stomach Fatigue** (creative addition):
- A hidden `stomachFatigue` counter that increases when actively suppressing and decreases when not
- Each hour of active suppression adds `numFightingPrey × 1` fatigue
- Each hour without suppression removes `2` fatigue
- When fatigue > 10, suppression effectiveness worsens (0.3 → 0.5)
- When fatigue > 20, suppression becomes nearly ineffective (0.3 → 0.7)
- Represents muscle exhaustion from constant clenching
- Recovered by resting (not suppressing)

### 6. Stomach Resistance Multiplier

A new editable field in the BaseStats section:

```xml
<BaseStats>
  ...
  <StomachResistance>1.0</StomachResistance>
</BaseStats>
```

This is a multiplier representing how strong the pred's stomach muscles are at resisting struggle. The extension reads it and applies it as `stomachResistanceFactor = 1.0 / StomachResistance` to the indigestion gain formula.

| StomachResistance | Effect | Character Concept |
|-------------------|--------|-------------------|
| 0.5 | Indigestion builds 2× faster | Weak stomach, first-time pred |
| 1.0 | Normal (default) | Average pred |
| 2.0 | Indigestion builds half as fast | Experienced pred |
| 3.0 | Indigestion builds 1/3 as fast | Veteran predator |
| 5.0 | Nearly impossible to upset | Supernatural stomach strength |

**Suppression stacks on top:**
- StomachResistance 2.0 + passive suppression: indigestion gain × 0.5 × 0.7 = 0.35× normal
- StomachResistance 2.0 + active suppression: indigestion gain × 0.5 × 0.3 = 0.15× normal

**Editable in frontend**: Base Stats tab, alongside BaseDigestionRate, AcidRiseRate, etc. Default 1.0, range 0.1 to 10.0, step 0.1.

### 7. Vomit Event & Escape Chances

When indigestion reaches 100%, a **vomit event** triggers. The pred involuntarily throws up — but NOT all prey escape. Each prey has a **probabilistic escape chance** based on how much they personally contributed to the struggle.

**Escape chance formula:**
```
escapeChance = baseEscapeChance × consciousnessFactor × struggleShareFactor
```

Where:
- `baseEscapeChance` = 90%
- `consciousnessFactor` = from table above (more conscious = more likely to escape)
- `struggleShareFactor` = `0.5 + 0.5 × (personalStruggle / totalStruggle)`
  - Single prey: 0.5 + 0.5 × 1.0 = 1.0 → 90% × consciousness × 1.0 = 90% ✓
  - Every prey gets at least 50% of the base chance, but those who fought hardest get more

**Willing prey**: Still get an escape roll during vomit (vomit is involuntary), but at the minimum struggleShareFactor of 0.5 (since they contributed 0 struggle). So a fully conscious willing prey: 90% × 1.0 × 0.5 = 45%.

**Size factor**: Already baked into struggle contribution — bigger prey contribute more indigestion per tick (via sizeFactor in the gain formula), so they naturally accumulate a larger share of totalStruggle. No separate size factor in escape chance.

**Examples:**

Single prey (Alice, fighting, 20% digested):
→ 90% × 1.0 × 1.0 = **90%**

Three prey, all fighting:
- Alice (60% of struggle, 20% digested): 90% × 1.0 × (0.5+0.5×0.6) = 90% × 0.8 = **72%**
- Bob (30% of struggle, 10% digested): 90% × 1.0 × (0.5+0.5×0.3) = 90% × 0.65 = **58.5%**
- Cara (10% of struggle, 40% digested): 90% × 1.0 × (0.5+0.5×0.1) = 90% × 0.55 = **49.5%**

Half-digested prey (50-70% digested, single):
→ 90% × 0.5 × 1.0 = **45%** — too weak to reliably escape

Almost dissolved (70-85% digested, single):
→ 90% × 0.1 × 1.0 = **9%** — barely coming up

**After vomit event:**
- Indigestion resets to **0%**
- Escaped prey are removed from stomach, LLM is notified to narrate the vomit
- Prey who don't escape remain in stomach
- The pred is exhausted — **Energy drops by 20** as a penalty
- Stomach fatigue reduced by 5 (partial relief from the vomit)

The extension rolls for each prey independently. Maybe only one escapes, maybe nobody does, maybe all of them do.

### 8. Energy System

The existing `<Energy>` stat (in `<State>`) is used. Currently it's a flavor stat — this gives it mechanical weight.

**Energy drain per tick:**
```
totalFightingStruggle = Σ indigestionGain for all fighting prey
energyDrain = totalFightingStruggle × 0.5

if suppressing="true":
  energyDrain += numFightingPrey × 2 × elapsedHours

Energy = max(0, Energy - energyDrain)
```

**Energy recovery:**
- When no prey is fighting: `Energy += 3 × elapsedHours` (slow recovery)
- When stomach is empty: `Energy += 5 × elapsedHours` (full recovery)
- Capped at 100 (or whatever max Energy is set to)

**Low energy effects:**
- Energy ≤ 20: suppressionFactor worsens (passive: 0.7 → 0.85, active: 0.3 → 0.5)
- Energy = 0: no suppression possible, indigestion accumulates at full rate

**Vomit penalty**: Energy drops by 20 when a vomit event triggers.

---

## Indigestion Events (Threshold Triggers)

At certain indigestion thresholds, the extension generates events that get injected into the LLM prompt for the next turn, creating narrative beats:

| Indigestion % | Event | LLM Prompt Injection |
|---------------|-------|---------------------|
| 25 | Mild Discomfort | "The pred feels mild discomfort in their stomach — slight nausea, prey movements are noticeable." |
| 50 | Visible Distress | "The pred's belly is visibly bulging and shifting — onlookers can see something is alive inside. The pred feels significant nausea." |
| 75 | Gag Reflex | "The pred feels a strong urge to retch — involuntary gagging, difficulty keeping prey down. Vomit is approaching." |
| 90 | Critical Nausea | "The pred is on the verge of vomiting — they can barely hold the prey down. One more struggle could trigger it." |
| 100 | Vomit Event | "The pred vomits! Prey may escape — narrate the vomit and check which prey escaped." |

These are one-shot triggers (don't repeat if indigestion dips and rises again past the same threshold). Tracked via a `indigestionEventsTriggered` attribute on the Stomach tag.

---

## Prey Stamina (Creative Addition)

A `stamina` attribute (0–100, default 100) that depletes when fighting and recovers when not.

**Stamina drain** (when fighting):
```
staminaLoss = 3 × elapsedHours × sizeFactor
```

**Stamina recovery** (when not fighting):
```
staminaGain = 5 × elapsedHours
```

**Effect**: When stamina reaches 0, the prey is forced into "Reluctant" state temporarily (the extension overrides willingness to "reluctant" and adds a note to the LLM prompt: "Prey is exhausted and cannot fight anymore — they've gone limp."). Stamina recovers over time, and once it reaches 30+, the prey can be set back to Fighting by the LLM.

This prevents infinite struggling and creates a natural rhythm: fight → exhaust → recover → fight again.

---

## XML Structure Changes

### Stomach Tag — New Attributes

```xml
<Stomach current="65 L" max="115.20 L" suppressing="true" indigestion="45" indigestionEvents="discomfort,distress">
```

New attributes:
- `suppressing`: "true" | "false" (default: "false") — set by LLM when pred actively suppresses
- `indigestion`: 0–100 (default: 0) — managed automatically by extension
- `indigestionEvents`: comma-separated list of triggered event IDs (for one-shot tracking)

### Prey Item — New Attributes

```xml
<Item type="Prey" name="Alice" volume_L="65" digestion="25%"
      willingness="fighting" stamina="80">
  <Appearance>22-year-old human woman, slender, short red hair, green eyes</Appearance>
  <Description>Thrashing violently against the stomach walls, acids lapping at her chest.</Description>
  <BoundGear>blue dress, leather boots</BoundGear>
</Item>
```

New attributes:
- `willingness`: "willing" | "reluctant" | "fighting" (default: "reluctant")
- `stamina`: 0–100 (default: 100)

Note: No per-prey `struggle` attribute — indigestion is stomach-level. The extension tracks each prey's struggle contribution internally during the tick for escape chance calculations, but doesn't persist it to XML.

### State — Energy Already Exists

`<Energy>` is already in the State section. No new tag needed — just mechanical weight added to it.

### BaseStats — New Optional Config Stats

```xml
<BaseStats>
  ...
  <StomachResistance>1.0</StomachResistance>
  <BaseIndigestionRate>30</BaseIndigestionRate>
  <IndigestionDecayRate>20</IndigestionDecayRate>
</BaseStats>
```

These are optional — if absent, defaults (1.0, 30, and 20) are used. Consistent with how `BaseDigestionRate` and `AcidRiseRate` work.

---

## Backend Integration

### `digestItemsInContent()` — Modified

The `digestItem()` inner function gains struggle processing for Prey items:

1. Read `willingness` attribute → apply digestion speed multiplier
2. Read `stamina` attribute → drain or recover
3. Calculate `consciousnessFactor` from current digestion %
4. Calculate `sizeFactor` from prey volume vs stomach max (passed in via ctx)
5. Calculate per-prey indigestion contribution
6. Track personalStruggle for escape chance calculations
7. Write back updated `willingness`, `stamina` attributes

### `runDigestionTick()` — Modified

1. Read `suppressing` attribute from `<Stomach>` tag
2. Read `indigestion` attribute from `<Stomach>` tag
3. Read `Energy` from `<State>`
4. Read `StomachResistance` from `<BaseStats>` (default 1.0)
5. Calculate stomach max capacity (same formula as frontend: `height × weight × 0.012 × CapacityMultiplier`)
6. Pass stomach max, suppression state, and resistance to `digestItemsInContent()` via ctx
7. After digestion: sum indigestion contributions from all prey
8. Apply suppression factor based on Stomach `suppressing` attribute and Energy
9. Apply stomach resistance factor
10. Update indigestion (accumulate or decay)
11. Process energy drain/recovery
12. Process stomach fatigue
13. Check indigestion thresholds → trigger events
14. Check indigestion ≥ 100 → trigger vomit event (roll escape chances, remove escaped prey)
15. Update `<Energy>` and `<indigestion>` in XML
16. Collect indigestion events and vomit notifications for LLM prompt injection

### New: `processStruggle()` Function

A dedicated function (similar to how `processClothingStress()` is separate) that handles the struggle/indigestion logic, called from `runDigestionTick()` when `engineToggles.struggleEngine` is true.

### `buildSheetPrompt()` — Modified

Add instructions about struggle mechanics:
- Explain willingness states and when to use them
- Explain `suppressing` attribute on Stomach tag
- Explain that indigestion/stamina are managed automatically
- Explain indigestion events and how to narrate them
- Explain vomit events and escape notifications
- Explain StomachResistance

### Vomit/Event Notification Injection

When a vomit event or threshold event occurs, the extension adds a note to the next prompt injection:
```
─── STRUGGLE EVENTS ───
VOMIT: The pred has vomited! The following prey escaped: "Alice". 
Remove them from the Stomach section in your sheet_update (the extension 
has already removed them from the stored sheet). Narrate the vomit scene.
"Bob" did not escape and remains in the stomach.

THRESHOLD EVENT: Indigestion reached 75% — the pred is gagging, struggling 
to keep prey down. Narrate this.
```

### New Engine Toggle

```typescript
engineToggles: {
  digestionEngine: true,
  clothingStress: true,
  nutrientAbsorption: true,
  arousalClimax: true,
  struggleEngine: true,  // NEW
}
```

---

## Frontend Integration

### Stomach Section — New Controls

1. **Indigestion meter**: Visual bar (0–100) with color coding:
   - 0–25: green (calm)
   - 25–50: yellow (struggling)
   - 50–75: orange (desperate)
   - 75–100: red (critical — vomit imminent)
2. **Indigestion status text**: "Calm" / "Struggling" / "Desperate" / "Critical" / "Vomiting"
3. **Suppressing toggle**: Checkbox next to the stomach capacity display — sets `suppressing="true"` on the Stomach tag. Only visible when prey items are present.

### Prey Item UI — New Controls

In `createStomachItem()`, when type is "Prey", add:

1. **Willingness dropdown**: Willing / Reluctant / Fighting
2. **Stamina bar**: Smaller visual bar (0–100), blue
3. **Stamina status text**: "Fresh" / "Tired" / "Exhausted"

### Base Stats Tab — New Field

- **Stomach Resistance** input: number field, default 1.0, range 0.1 to 10.0, step 0.1
- Placed alongside BaseDigestionRate, AcidRiseRate, etc.

### Energy Display Enhancement

The existing Energy field gets a visual indicator:
- Green when > 50
- Yellow when 20–50
- Red when < 20
- Pulsing red when 0

### `buildCurrentXml()` — Modified

Write `willingness`, `stamina` attributes on Prey items.
Write `suppressing`, `indigestion`, `indigestionEvents` attributes on Stomach tag.
Write `StomachResistance`, `BaseIndigestionRate`, `IndigestionDecayRate` in BaseStats.

### `populateFormFromXml()` — Modified

Read and populate the new attributes from XML.

### `updateCapacities()` — Enhanced

Show struggle risk assessment based on total prey volume vs capacity:
- "Low Risk" (prey < 30% capacity)
- "Moderate Risk" (30–60%)
- "High Risk" (60–100%)
- "Critical Risk" (> 100%)

---

## LLM Prompt Additions

New section in `buildSheetPrompt()`:

```
──── STRUGGLE SYSTEM ────
Prey inside the stomach can struggle, building up indigestion. The extension 
handles all struggle math automatically.

WILLINGNESS STATES (you set this on each Prey item):
- willingness="willing": Prey accepts their fate. +25% digestion speed, no indigestion.
- willingness="reluctant": Prey resists passively. Normal digestion, minimal indigestion.
- willingness="fighting": Prey actively fights. -50% digestion speed, full indigestion.

Set willingness based on the narrative. Prey who are scared, angry, or desperate fight. 
Prey who are charmed, hypnotized, or accepting are willing. Update willingness as the 
scene evolves.

SUPPRESSION: When the pred actively clenches their stomach to suppress struggling, 
set suppressing="true" on the <Stomach> tag. This drains Energy but greatly reduces 
indigestion accumulation. Remove the attribute or set "false" when not suppressing.

INDIGESTION: The extension automatically updates the indigestion attribute (0-100) on 
the Stomach tag. At 100%, the pred vomits — prey may escape. You will be notified in 
the prompt if this happens. Narrate the vomit scene and remove any escaped prey.

STAMINA: Prey stamina depletes when fighting. At 0, they're forced to "reluctant" and 
can't fight until they recover. The extension handles this automatically.

INDIGESTION EVENTS: At 25%, 50%, 75%, and 90% indigestion, narrative events trigger. 
You will be notified — narrate them (discomfort, visible bulging, gagging, critical nausea).

ENERGY: Fighting prey drain your Energy. Low Energy means weaker suppression. Manage 
your Energy — if it hits 0, you cannot suppress at all. Vomiting also costs 20 Energy.
```

---

## Edge Cases

1. **Multiple fighting prey**: Each contributes independently to the single stomach-level indigestion meter. Indigestion stacks — 3 fighting prey = 3× the gain. At vomit, each prey's escape chance depends on their personal struggle share.

2. **Prey in bowels**: Indigestion is possible but at 50% effectiveness (tighter space). Size factor uses bowel max capacity instead. Generally harder to cause vomit from bowels.

3. **Prey added mid-struggle**: New prey start at stamina=100, willingness set by LLM (default "reluctant" if not specified). They begin contributing to indigestion immediately.

4. **Time skip**: Large time deltas (e.g., 8 hours) process normally — indigestion accumulates/decays proportionally. A fighting prey with high size factor could trigger vomit during a long skip if the pred isn't suppressing.

5. **Rollback**: If a message is deleted, the sheet reverts. Indigestion values revert with it. No special handling needed — the snapshot system already covers this.

6. **Engine disabled**: If `struggleEngine` is false, struggle attributes are ignored. Prey items without struggle attributes work fine (default willingness="reluctant", stamina=100). Stomach without indigestion attribute works fine (default 0). Full backward compatibility.

7. **All prey willing**: Indigestion decays at 2× rate. No vomit risk. The pred's stomach is calm.

8. **Vomit with all willing prey**: If indigestion somehow reaches 100% with all willing prey (e.g., they were fighting, then became willing, but indigestion was already high), vomit still triggers. Willing prey get reduced escape chance (45% if fully conscious) — vomit is involuntary.

9. **Prey at 85%+ digestion**: consciousnessFactor = 0, so they contribute nothing to indigestion and have 0% escape chance during vomit. They're too digested to fight or escape.

10. **StomachResistance = 0**: Division by zero protection — clamp minimum to 0.1 (so max factor = 10× faster indigestion).

---

## Configuration Summary

| Parameter | Default | Location | Notes |
|-----------|---------|----------|-------|
| BaseIndigestionRate | 30/hr | Constant or `<BaseIndigestionRate>` | Indigestion accumulation rate |
| IndigestionDecayRate | 20/hr | Constant or `<IndigestionDecayRate>` | Decay rate (slower than accumulation) |
| StomachResistance | 1.0 | `<StomachResistance>` | Multiplier on indigestion gain (1/Resistance) |
| BaseEscapeChance | 90% | Constant | Base chance for single fully-conscious prey |
| PassiveSuppressionFactor | 0.7 | Constant | 30% reduction when not actively suppressing |
| ActiveSuppressionFactor | 0.3 | Constant | 70% reduction when suppressing |
| StaminaDrainRate | 3/hr | Constant | Per fighting prey, scaled by size |
| StaminaRecoveryRate | 5/hr | Constant | When not fighting |
| EnergyDrainPerStruggle | 0.5 | Constant | Energy lost per indigestion point gained |
| ActiveSuppressEnergyCost | 2/hr | Constant | Per fighting prey, when suppressing |
| EnergyRecoveryRate | 3/hr | Constant | When no prey fighting |
| EmptyStomachEnergyRecovery | 5/hr | Constant | When stomach empty |
| VomitEnergyPenalty | 20 | Constant | Energy drop when vomit triggers |
| FatiguePerHour | 1/prey | Constant | Per fighting prey when suppressing |
| FatigueRecovery | 2/hr | Constant | When not suppressing |
| FatigueThreshold1 | 10 | Constant | Suppression effectiveness worsens |
| FatigueThreshold2 | 20 | Constant | Suppression nearly ineffective |
| VomitFatigueRelief | 5 | Constant | Fatigue reduction after vomit |

---

## Implementation Todo List

1. Add `struggleEngine` toggle to engine toggles (backend + frontend)
2. Add `indigestion`, `indigestionEvents`, `suppressing` attributes to Stomach tag schema
3. Add `willingness`, `stamina` attributes to prey item XML schema
4. Add `StomachResistance`, `BaseIndigestionRate`, `IndigestionDecayRate` to BaseStats schema
5. Implement `processStruggle()` function in backend
6. Integrate struggle processing into `digestItemsInContent()` and `runDigestionTick()`
7. Implement vomit event trigger at 100% indigestion
8. Implement escape chance calculation and probabilistic prey removal
9. Implement indigestion event threshold triggers (25/50/75/90%)
10. Implement energy drain/recovery logic
11. Implement stomach fatigue system
12. Implement stamina drain/recovery with forced willingness override
13. Update `buildSheetPrompt()` with struggle system instructions
14. Implement vomit/event notification injection for next LLM turn
15. Update frontend `createStomachItem()` with willingness dropdown, stamina bar
16. Update frontend with indigestion meter on Stomach section
17. Update frontend with suppression toggle on Stomach section
18. Add Stomach Resistance input to Base Stats tab in frontend
19. Update frontend `buildCurrentXml()` to write new attributes
20. Update frontend `populateFormFromXml()` to read new attributes
21. Update frontend `updateCapacities()` with struggle risk assessment
22. Update frontend energy display with visual indicators
23. Update frontend item status logic to include struggle state
24. Add toast notifications for indigestion events and vomit/escapes
25. Add toast settings category for struggle events
26. Test backward compatibility (prey items and stomach without struggle attributes)
