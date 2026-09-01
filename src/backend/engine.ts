declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import { engineToggles, toastSettings } from './state'

import {
  ATTRIBUTE_STAT_MAP,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_MODIFIER_WEIGHT,
  conditionThresholds,
  conditionNames,
  slotBodyMap,
  stressMultipliers,
} from './types'

/** Compute elapsed hours between two story-clock timestamps (0-24 range),
 *  handling midnight wraparound. If the raw delta is < -12 we assume the
 *  clock crossed midnight and add 24. The result is clamped to >= 0 so
 *  rollback / same-tick situations don't produce negative digestion. */
export function clockDelta(now: number, then: number): number {
  let d = now - then
  if (d < -12) d += 24
  return Math.max(0, d)
}

export function maybeToast(category: string, type: 'success' | 'warning' | 'error' | 'info', message: string) {
  if (toastSettings[category] === false) return
  spindle.toast[type](message, { duration: 8000 })
}

export function sheetPath(chatId: string) {
  return `sheets/${chatId}.xml`
}
export function snapshotsPath(chatId: string) {
  return `snapshots/${chatId}.json`
}

export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('\n')
  }
  return ''
}

export function extractSheetUpdate(content: unknown): string | null {
  let text = ''
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    text = content
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('\n')
  } else {
    return null
  }

  const match = text.match(
    /<sheet_update>\s*([\s\S]*?)\s*<\/sheet_update>/i,
  )
  return match ? match[1].trim() : null
}

export function findLastAssistantMessage(messages: any[]): any | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.__isChatHistory) return msg
  }
  return null
}

export function getAttrFromString(str: string, attr: string): string {
  const match = str.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
  return match ? match[1] : ''
}

export function collectBuffs(xml: string): Record<string, number> {
  const buffs: Record<string, number> = {}
  const parseBuffsAttr = (attrs: string) => {
    const buffsAttr = getAttrFromString(attrs, 'buffs')
    if (!buffsAttr) return
    buffsAttr.split(';').forEach(pair => {
      const [stat, pct] = pair.split(':')
      if (stat && pct) {
        const key = stat.trim()
        const val = (parseFloat(pct) || 0) / 100
        buffs[key] = (buffs[key] || 0) + val
      }
    })
  }
  const skillRegex = /<Skill\s+([^>]*?)>/gi
  let m: RegExpExecArray | null
  while ((m = skillRegex.exec(xml)) !== null) parseBuffsAttr(m[1])
  const traitRegex = /<Trait\s+([^>]*?)>/gi
  while ((m = traitRegex.exec(xml)) !== null) parseBuffsAttr(m[1])
  return buffs
}

// ─── Modifier Pipeline ──────────────────────────────────────
// All modifier sources (buffs, attributes, health states, energy states,
// status effects) are summed into one additive pool per stat key, then
// clamped to [-0.50, +0.50] before being applied as rate × (1 + finalMultiplier).

/** Clamp every value in a modifier map to [-0.50, +0.50]. */
export function applyModifierCap(modifiers: Record<string, number>): Record<string, number> {
  const capped: Record<string, number> = {}
  for (const key of Object.keys(modifiers)) {
    capped[key] = Math.max(-0.50, Math.min(0.50, modifiers[key]))
  }
  return capped
}

/**
 * Collect ALL modifiers from every source (buffs, attributes, health, energy,
 * status effects) into a single additive pool per stat key.
 * Each source is guarded by its engine toggle so that disabling a system
 * removes its contribution entirely.
 */
export function collectModifiers(xml: string): Record<string, number> {
  const modifiers: Record<string, number> = {}

  // 1. Buffs from <Skill buffs="…"> and <Trait buffs="…">
  if (engineToggles.buffSystem) {
    const buffs = collectBuffs(xml)
    for (const [key, val] of Object.entries(buffs)) {
      modifiers[key] = (modifiers[key] || 0) + val
    }
  }

  // 2. Attribute modifiers
  if (engineToggles.attributeSystem) {
    const attrMods = processAttributes(xml)
    for (const [key, val] of Object.entries(attrMods)) {
      modifiers[key] = (modifiers[key] || 0) + val
    }
  }

  // Future sources (health states, energy states, status effects) will be
  // merged here in later phases, each guarded by its own toggle.

  return applyModifierCap(modifiers)
}

// ─── Attribute System ──────────────────────────────────────
// Six attributes (STR, DEX, CON, INT, WIS, CHA), default score 10.
// Modifier = floor((score - 10) / 2), range -5..+5 at scores 0..20.
// Each attribute's modifier contributes  modifier × 0.05  to the relevant
// stat's additive pool (so a +5 modifier = +25% to that stat).

/** Read a single attribute score from the <Attributes> XML block. */
export function getAttribute(xml: string, key: string): number {
  const match = xml.match(new RegExp(`<${key}>(.*?)<\\/${key}>`, 'i'))
  return match ? parseFloat(match[1]) || 10 : 10
}

/** Compute the D&D-style modifier for a score: floor((score - 10) / 2). */
export function attributeModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * Parse the <Attributes> block and return a modifier map keyed by stat name.
 * Each attribute's modifier × 0.05 is added to every stat it influences.
 */
export function processAttributes(xml: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const attrKey of ATTRIBUTE_KEYS) {
    const score = getAttribute(xml, attrKey)
    const mod = attributeModifier(score)
    if (mod === 0) continue // score 10 → modifier 0 → no contribution
    const contribution = mod * ATTRIBUTE_MODIFIER_WEIGHT
    const stats = ATTRIBUTE_STAT_MAP[attrKey] || []
    for (const statKey of stats) {
      out[statKey] = (out[statKey] || 0) + contribution
    }
  }
  return out
}

export function getStat(xml: string, tag: string): number {
  const match = xml.match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`, 'i'))
  return match ? parseFloat(match[1]) || 0 : 0
}

export function setStat(xml: string, tag: string, value: number): string {
  const regex = new RegExp(`<${tag}>.*?<\\/${tag}>`, 'i')
  const replacement = `<${tag}>${value.toFixed(2)}</${tag}>`
  if (regex.test(xml)) {
    return xml.replace(regex, replacement)
  }
  // Tag doesn't exist yet — inject it. Try several insertion points in
  // order of preference: inside <BaseStats>, after the first opening tag,
  // or prepend to the document as a last resort.
  if (xml.includes('</BaseStats>')) {
    return xml.replace(
      /<\/BaseStats>/i,
      `    <${tag}>${value.toFixed(2)}</${tag}>\n  </BaseStats>`,
    )
  }
  // No </BaseStats> — try inserting after the first opening tag (e.g. <CharacterSheet>)
  const firstTagMatch = xml.match(/<(\w+)[^>]*>/)
  if (firstTagMatch) {
    const firstTag = firstTagMatch[0]
    const firstTagEnd = xml.indexOf(firstTag) + firstTag.length
    return (
      xml.slice(0, firstTagEnd) +
      `\n  <${tag}>${value.toFixed(2)}</${tag}>` +
      xml.slice(firstTagEnd)
    )
  }
  // Last resort: prepend
  return `<${tag}>${value.toFixed(2)}</${tag}>\n${xml}`
}

export function deriveCondition(
  stress: number,
  elasticity: string,
  lockedCondition?: string,
): string {
  if (elasticity === 'magic') return 'intact'
  const thresholds = conditionThresholds[elasticity] || conditionThresholds.standard
  let newCondition = 'intact'
  for (let i = 0; i < thresholds.length; i++) {
    if (stress >= thresholds[i]) {
      newCondition = conditionNames[i]
    }
  }
  if (lockedCondition === 'damaged' || lockedCondition === 'ruined') {
    const lockedIdx = conditionNames.indexOf(lockedCondition)
    const newIdx = conditionNames.indexOf(newCondition)
    if (newIdx < lockedIdx) {
      return lockedCondition
    }
  }
  return newCondition
}

export function processClothingStress(
  xml: string,
  oldXml: string,
  clothingStressMult: number = 0,
): { xml: string; damageEvents: string[] } {
  const damageEvents: string[] = []
  const getMode = (x: string) => {
    const m = x.match(/<ClothingMode>(.*?)<\/ClothingMode>/i)
    return (m && m[1].trim().toLowerCase()) || 'flavor'
  }
  const oldMode = getMode(oldXml)
  const newMode = getMode(xml)

  if (oldMode !== newMode) {
    spindle.log.info(`Clothing mode changed: ${oldMode} → ${newMode}, wiping stress/condition`)
    xml = xml.replace(/<Equip\s+([^>]*?)>/gi, (match, attrs) => {
      let cleanAttrs = attrs
        .replace(/\s+stress="[^"]*"/gi, '')
        .replace(/\s+condition="[^"]*"/gi, '')
      return `<Equip ${cleanAttrs.trim()}>`
    })
    if (newMode !== 'hardcore') return { xml, damageEvents }
  }

  if (newMode !== 'hardcore') return { xml, damageEvents }

  // Build a map of slot -> { stress, condition } from the stored sheet so
  // the LLM cannot "repair" clothing by outputting lower stress or better
  // condition values than what was previously stored.
  const oldEquipMap = new Map<string, { stress: number; condition: string }>()
  const oldEquipRegex = /<Equip\s+([^>]+?)[\s/]*>/gi
  let oldEquipMatch: RegExpExecArray | null
  while ((oldEquipMatch = oldEquipRegex.exec(oldXml)) !== null) {
    const eqAttrs = oldEquipMatch[1]
    const eqSlot = getAttrFromString(eqAttrs, 'slot')
    if (eqSlot) {
      oldEquipMap.set(eqSlot, {
        stress: parseFloat(getAttrFromString(eqAttrs, 'stress')) || 0,
        condition: getAttrFromString(eqAttrs, 'condition') || 'intact',
      })
    }
  }

  const oldHeight = getStat(oldXml, 'Height_cm') || 160
  const newHeight = getStat(xml, 'Height_cm') || 160
  const oldWeight = getStat(oldXml, 'Weight_kg') || 60
  const newWeight = getStat(xml, 'Weight_kg') || 60
  const oldBreasts = getStat(oldXml, 'BreastVolume_ml') || 0
  const newBreasts = getStat(xml, 'BreastVolume_ml') || 0
  const oldHips = getStat(oldXml, 'Hips_cm') || 90
  const newHips = getStat(xml, 'Hips_cm') || 90
  const oldPenisL = getStat(oldXml, 'PenisLength_cm') || 0
  const newPenisL = getStat(xml, 'PenisLength_cm') || 0

  const deltas: Record<string, number> = {
    height: newHeight - oldHeight,
    weight: newWeight - oldWeight,
    breasts: newBreasts - oldBreasts,
    hips: newHips - oldHips,
    penis: newPenisL > 0 ? newPenisL - oldPenisL : 0,
  }

  xml = xml.replace(
    /<Equip\s+([^>]*?)>([\s\S]*?)<\/Equip>/gi,
    (match, attrs, inner) => {
      const slot = getAttrFromString(attrs, 'slot') || ''
      const elasticity = getAttrFromString(attrs, 'elasticity') || 'standard'

      if (elasticity === 'magic') {
        let cleanAttrs = attrs
          .replace(/\s+stress="[^"]*"/gi, '')
          .replace(/\s+condition="[^"]*"/gi, '')
        return `<Equip ${cleanAttrs.trim()}>${inner}</Equip>`
      }

      const oldEq = oldEquipMap.get(slot)
      let stress = Math.max(
        parseFloat(getAttrFromString(attrs, 'stress')) || 0,
        oldEq?.stress || 0,
      )
      const oldCondition = oldEq?.condition || getAttrFromString(attrs, 'condition') || 'intact'

      const affectedParts = slotBodyMap[slot] || ['weight']

      let stressChange = 0
      for (const part of affectedParts) {
        const delta = deltas[part] || 0
        const mult = stressMultipliers[part] || 1
        stressChange += delta * mult
      }
      stressChange *= (1 + clothingStressMult)

      stress += stressChange
      stress = Math.max(0, stress)

      const thresholds = conditionThresholds[elasticity] || conditionThresholds.standard
      if (oldCondition === 'damaged' || oldCondition === 'ruined') {
        stress = Math.max(stress, thresholds[3])
      }

      const newCondition = deriveCondition(stress, elasticity, oldCondition)

      if (newCondition !== oldCondition) {
        const isDamage = ['damaged', 'ruined'].includes(newCondition)
        if (isDamage) {
          damageEvents.push(`${slot}: ${oldCondition}→${newCondition}`)
        }
      }

      let cleanAttrs = attrs
        .replace(/\s+stress="[^"]*"/gi, '')
        .replace(/\s+condition="[^"]*"/gi, '')
        .trim()

      return `<Equip ${cleanAttrs} stress="${stress.toFixed(2)}" condition="${newCondition}">${inner}</Equip>`
    },
  )

  xml = xml.replace(
    /<Equip\s+([^>]+?)\s*\/>/gi,
    (match, attrs) => {
      const slot = getAttrFromString(attrs, 'slot') || ''
      const elasticity = getAttrFromString(attrs, 'elasticity') || 'standard'

      if (elasticity === 'magic') {
        let cleanAttrs = attrs
          .replace(/\s+stress="[^"]*"/gi, '')
          .replace(/\s+condition="[^"]*"/gi, '')
        return `<Equip ${cleanAttrs.trim()} />`
      }

      const oldEq = oldEquipMap.get(slot)
      let stress = Math.max(
        parseFloat(getAttrFromString(attrs, 'stress')) || 0,
        oldEq?.stress || 0,
      )
      const oldCondition = oldEq?.condition || getAttrFromString(attrs, 'condition') || 'intact'

      const affectedParts = slotBodyMap[slot] || ['weight']

      let stressChange = 0
      for (const part of affectedParts) {
        const delta = deltas[part] || 0
        const mult = stressMultipliers[part] || 1
        stressChange += delta * mult
      }
      stressChange *= (1 + clothingStressMult)

      stress += stressChange
      stress = Math.max(0, stress)

      const thresholds = conditionThresholds[elasticity] || conditionThresholds.standard
      if (oldCondition === 'damaged' || oldCondition === 'ruined') {
        stress = Math.max(stress, thresholds[3])
      }

      const newCondition = deriveCondition(stress, elasticity, oldCondition)

      if (newCondition !== oldCondition) {
        if (['damaged', 'ruined'].includes(newCondition)) {
          damageEvents.push(`${slot}: ${oldCondition}→${newCondition}`)
        }
      }

      let cleanAttrs = attrs
        .replace(/\s+stress="[^"]*"/gi, '')
        .replace(/\s+condition="[^"]*"/gi, '')
        .trim()

      return `<Equip ${cleanAttrs} stress="${stress.toFixed(2)}" condition="${newCondition}" />`
    },
  )

  return { xml, damageEvents }
}

export function digestItemsInContent(
  content: string,
  ctx: {
    baseDigRate: number
    acidMultiplier: number
    /** Current story-clock time (decimal hours, 0-24 range, from <Time>). */
    currentClock: number
    /** Previous tick's story-clock time (from <Time> in the old sheet).
     *  Used as the fallback timeAdded for items that existed in the old
     *  sheet but lack a timeAdded attribute — without this, they would
     *  default to currentClock and compute 0 digestion. */
    oldClock: number
    oldDigestionMap: Map<string, number>
    /** Map of item name -> timeAdded from the previous tick's stored sheet.
     *  The LLM never includes timeAdded in its output, so without this map
     *  every item would be treated as brand-new (timeAdded = currentClock)
     *  and digestion would always compute to 0. */
    oldTimeAddedMap: Map<string, number>
  },
): {
  content: string
  totalDigestedVol: number
  wasteCount: number
  accumulatedWasteVol: number
  newRemains: string[]
  itemCount: number
} {
  let totalDigestedVol = 0
  let wasteCount = 0
  let accumulatedWasteVol = 0
  const newRemains: string[] = []
  let itemCount = 0

  const digestItem = (
    attrs: string,
    inner: string | null,
    isSelfClosing: boolean,
  ): string => {
    itemCount++
    const type = getAttrFromString(attrs, 'type') || 'Food'
    const name = getAttrFromString(attrs, 'name')
    const vol = getAttrFromString(attrs, 'volume_L')

    let speedMult = 1
    if (type === 'Liquid') speedMult = 3
    else if (type === 'Prey') {
      speedMult = 0.5
      const willingness = (getAttrFromString(attrs, 'willingness') || 'reluctant').toLowerCase()
      if (willingness === 'willing') speedMult *= 1.25
      else if (willingness === 'fighting') speedMult *= 0.5
    }

    // ABSOLUTE DIGESTION: each item carries a timeAdded timestamp on the
    // story clock (decimal hours, 0-24 range, from <Time>); digestion is
    // recomputed from scratch every tick:
    //   digestion = baseDigRate * speedMult * acidMult * clockDelta(now, timeAdded)
    // Self-healing — skipped ticks, crashes, and rollbacks cannot lose time.
    // The LLM never includes the engine-injected timeAdded attribute in its
    // output, so we must look it up from the old (stored) sheet's map first.
    // Only fall back to the LLM's attribute or back-calculation if the old
    // sheet doesn't have it (truly new item or legacy migration).
    let timeAdded = ctx.oldTimeAddedMap.get(name) ?? NaN
    let oldDigNum = ctx.oldDigestionMap.get(name) ?? 0

    if (isNaN(timeAdded) || timeAdded <= 0) {
      // Not in oldTimeAddedMap — try the LLM's attribute (rare, but possible
      // if the LLM copied it from the prompt).
      timeAdded = parseFloat(getAttrFromString(attrs, 'timeAdded'))
    }

    if (isNaN(timeAdded) || timeAdded <= 0) {
      // No timestamp from oldTimeAddedMap or the LLM's attribute.
      if (oldDigNum > 0) {
        // Legacy item with progress but no timestamp — back-calculate
        // timeAdded from its current digestion level. clockDelta handles
        // midnight wraparound so the back-calculated timestamp is correct
        // even if the item was added before midnight.
        timeAdded = ctx.currentClock - oldDigNum / (ctx.baseDigRate * speedMult * ctx.acidMultiplier)
        if (timeAdded < 0) timeAdded += 24
      } else if (ctx.oldDigestionMap.has(name)) {
        // Item existed in the old sheet but had no timeAdded and no
        // digestion progress. It must have been present at the previous
        // tick, so default to oldClock (not currentClock, which
        // would zero out the digestion calculation).
        timeAdded = ctx.oldClock
      } else {
        // Truly brand-new item — starts now.
        timeAdded = ctx.currentClock
      }
    }

    let digNum = Math.min(
      100,
      ctx.baseDigRate * speedMult * ctx.acidMultiplier * clockDelta(ctx.currentClock, timeAdded),
    )
    // Prevent rollback: never let digestion drop below the previously stored value
    digNum = Math.max(digNum, oldDigNum)

    if (digNum >= 100) {
      const numVol = parseFloat(vol) || 0
      totalDigestedVol += numVol

      if (type === 'Prey') {
        let remVol = numVol * 0.3
        let remName = `Skeleton of ${name}`
        if (inner) {
          const gearMatch = inner.match(/<BoundGear>([\s\S]*?)<\/BoundGear>/i)
          const gear = gearMatch ? gearMatch[1].trim() : ''
          if (gear) remName += `, ${gear}`
        }
        newRemains.push(`      <Remains volume_L="${remVol.toFixed(2)}">${remName}</Remains>`)
        wasteCount++
      } else {
        accumulatedWasteVol += numVol * 0.2
      }
      return ''
    }

    let preyAttrs = ''
    if (type === 'Prey') {
      const rawWillingness = (getAttrFromString(attrs, 'willingness') || 'reluctant').toLowerCase()
      const willingness = ['willing', 'reluctant', 'fighting'].includes(rawWillingness) ? rawWillingness : 'reluctant'
      const stamina = getAttrFromString(attrs, 'stamina') || '100'
      preyAttrs = ` willingness="${willingness}" stamina="${stamina}"`
    }
    const tsAttr = ` timeAdded="${timeAdded.toFixed(2)}"`
    if (isSelfClosing) {
      return `<Item type="${type}" name="${name}" volume_L="${vol}" digestion="${digNum.toFixed(2)}%"${tsAttr}${preyAttrs} />`
    }
    return `<Item type="${type}" name="${name}" volume_L="${vol}" digestion="${digNum.toFixed(2)}%"${tsAttr}${preyAttrs}>${inner}</Item>`
  }

  content = content.replace(
    /<Item\s+([^>]*[^>\/])\s*>([\s\S]*?)<\/Item>/gi,
    (match, attrs, inner) => digestItem(attrs, inner, false),
  )

  content = content.replace(
    /<Item\s+([^>]+?)\s*\/>/gi,
    (match, attrs) => digestItem(attrs, null, true),
  )

  return {
    content,
    totalDigestedVol,
    wasteCount,
    accumulatedWasteVol,
    newRemains,
    itemCount,
  }
}

export function buildSheetPrompt(sheetXml: string): string {
  return `[CHARACTER SHEET SYSTEM

You are the active manager of a persistent character sheet. The extension provides you with the current sheet state below. Every value in this sheet has been computed by the extension's simulation engines and represents the TRUE current state of the character. Your job is to produce an updated <sheet_update> block that copies ALL existing values exactly, advances time, and makes scene-appropriate changes ONLY to the fields you control.

<CurrentCharacterSheet>
${sheetXml}
</CurrentCharacterSheet>

─── HOW THE SYSTEM WORKS ───
The extension runs a "digestion tick" AFTER each of your responses. During this tick, the extension's engines compute:
- Digestion percentages (from each item's timeAdded timestamp and the current <Time>)
- Indigestion accumulation/decay (from prey willingness, prey size, pred suppression)
- Prey stamina drain/recovery (from willingness and fighting state)
- Prey struggle values (from willingness, size, consciousness, suppression)
- Pred Energy drain from struggle and suppression
- Nutrient absorption and body growth (Height, Weight, Breast, Hips, Penis)
- Clothing stress and condition degradation
- Climax meter (from Arousal)
- Current penis dimensions (from Arousal)
- Attribute modifiers and their effects on stats

These computed values are written into the stored sheet. The <CurrentCharacterSheet> you see above ALREADY contains all of these computed values from the last tick. They are the current truth.

CRITICAL: You MUST copy ALL values from <CurrentCharacterSheet> exactly as-is into your <sheet_update>. This includes indigestion, stamina, struggle, digestion, timeAdded, stress, condition, Climax, CurrentPenisLength_cm, and every other computed value. Never zero out, reset, or "forget" a value you see in the sheet. If you see indigestion="57", you MUST output indigestion="57". If you see stamina="45", you MUST output stamina="45". If you see digestion="25%", you MUST output digestion="25%". The extension will recompute these values again on the NEXT tick — your job is to preserve them, not override them.

─── YOUR RESPONSIBILITIES (what YOU must do) ───
1. ADVANCE <Time> FORWARD every turn. If the scene progresses, increase the <Time> value. The extension uses the time delta to calculate digestion, arousal decay, and body growth. If you do not advance time, the simulation stalls.
   FORMAT RULE: <Time> must contain ONLY a 24-hour clock value in "HH:MM" form (e.g. "10:23", "14:30"). Do NOT prefix it with a day, date, or any other text — "Day 1, 10:23" is INVALID and breaks the simulation. Correct: <Time>10:23</Time>. Incorrect: <Time>Day 1, 10:23</Time>.
   MANDATORY RULE: You MUST ALWAYS include a <Time> tag in every <sheet_update>. NEVER omit it, even if you think time didn't change — copy the previous value verbatim. If <Time> is missing from the sheet, the extension cannot calculate digestion and the simulation stalls completely.
2. Write a complete <sheet_update> block at the END of every response (see rules below). Previous sheet_update blocks have been removed from your chat history — you MUST still write a new one each turn.
3. Add <Item> entries to <Stomach> or <Bowels> when the character eats or is eaten. Remove them only if the item was regurgitated or otherwise exits the body.
4. Update <Arousal> based on what happens in the scene (intimacy raises it, time passes lowers it — the extension halves it each hour).
5. Update <Description> tags for prey each turn to reflect their current state (squirming, dissolving, going limp).
6. Fill in any blank State/World fields (Time, Weather, Temperature, etc.) with sensible defaults.
7. Set prey willingness="willing|reluctant|fighting" based on the scene narrative (see STRUGGLE & INDIGESTION SYSTEM below).
8. Set suppressing="true|false" on the <Stomach> tag based on the scene narrative.
9. Narrate struggle threshold events and vomit events when you receive STRUGGLE EVENTS notifications (see below).

─── PRE-COMPUTED VALUES (copy these EXACTLY as-is — do NOT modify, reset, or zero them) ───
The following values are computed by the extension's engines during the digestion tick. The sheet you receive already contains the correct values. You MUST copy them verbatim into your <sheet_update>:
- digestion="...%" on prey items (computed from timeAdded + current Time)
- timeAdded="..." on prey items (timestamp set when the item was eaten)
- indigestion="..." on the <Stomach> tag (computed from prey struggle)
- stamina="..." on prey items (computed from willingness + fighting state)
- struggle="..." on prey items (computed from willingness, size, consciousness, suppression)
- <FirstItemTime>, <StomachEmptyTime>, <CurrentAcidPct> (story-clock timestamps, 0-24h)
- <Climax> (computed from Arousal)
- <CurrentPenisLength_cm>, <CurrentPenisGirth_cm> (computed from Arousal)
- Clothing stress="..." and condition="..." attributes (computed from body growth)
- Height, Weight, BreastVolume, Hips, Penis dimensions (updated by nutrient absorption)

If any of these values seem wrong or unexpected, DO NOT "fix" them — copy them exactly. The extension will recompute them on the next tick.

─── UPDATE INSTRUCTIONS ───

You MUST include an updated copy of the FULL sheet inside a <sheet_update> block at the very END of EVERY response — even if nothing changed. Always advance <Time> forward as the scene progresses.

CRITICAL XML RULES:
1. You MUST copy the EXACT XML structure provided in <CurrentCharacterSheet>. Do NOT invent new tags, do NOT change tag names, do NOT change attributes.
2. Clothing MUST be inside <Clothing> using the <Equip slot="..." elasticity="...">...</Equip> format.
   VALID SLOT NAMES ONLY: "Head Top", "Face", "Head Lower", "Neck", "Underwear Top", "Underwear Bottom", "Torso Base", "Torso Mid", "Torso Outer", "Torso Shell", "Hands Base", "Hands Outer", "Legs Base", "Legs Outer", "Feet Base", "Feet Outer", "Jewelry", "Back", "Waist".
3. The <Equip> tag MUST ALWAYS have an elasticity attribute. Valid values are "rigid", "standard", "stretchy", or "magic". Never omit it. If the extension has added stress="..." or condition="..." attributes to an Equip tag, copy them exactly as-is. Do NOT modify or remove them.
4. Stomach and Bowel contents MUST use the <Item type="Liquid|Food|Prey" name="..." volume_L="..." digestion="...%"> format. Do not use a <Prey> tag. Items can be inside <Stomach> or <Bowels> (for full-tour scenarios). Backpack (inventory) items use a DIFFERENT, simpler format — see rule 19.
5. Prey identity, action, and gear go in SEPARATE tags. NEVER mix them:
   - <Appearance> = static identity (age, species, gender, build, hair, eyes). Stays the same unless the prey transforms.
   - <Description> = current dynamic action/state (squirming, dissolving, going limp). Updates EVERY turn.
   - <BoundGear> = clothing and equipment the prey is wearing.

   BAD (do NOT do this):
   <Item type="Prey" name="Alice" volume_L="65" digestion="25%">
     <Description>A young woman wearing a blue dress and leather boots, squirming helplessly.</Description>
   </Item>

   GOOD (do this):
   <Item type="Prey" name="Alice" volume_L="65" digestion="25%">
     <Appearance>22-year-old human woman, slender, short red hair, green eyes</Appearance>
     <Description>Squirming helplessly as acids rise past her waist.</Description>
     <BoundGear>blue dress, leather boots</BoundGear>
   </Item>
6. DO NOT calculate digestion percentages yourself. The extension's Metabolic Engine handles all digestion math automatically based on the <Time> you set. You only need to add items to the stomach or bowels when eaten, and update the <Time> tag. When copying existing prey items, COPY the digestion="...%" AND timeAdded="..." attributes EXACTLY as they appear in <CurrentCharacterSheet> — do NOT set digestion to "0%", remove it, or alter timeAdded. The extension advances the values automatically; your job is to preserve them as-is. When adding a NEW item that the character just ate, do NOT include a timeAdded attribute — the extension stamps it automatically.
7. If prey is fully digested (reaches 100%), the extension will AUTOMATICALLY move their remains to the Bowels section. You do NOT need to move the remains yourself. Just let the item disappear from <Stomach> in your next update if it was fully digested, and the extension will handle the transfer to <Bowels>.
8. The extension handles nutrient absorption and body growth. When items are digested, the character's Height, Weight, BreastVolume, Hips, and Penis dimensions increase proportionally. Copy these values from the sheet exactly as-is — do NOT manually adjust them based on digestion. Only adjust them if something else changes them (e.g. magic, transformation).
9. The extension AUTOMATICALLY handles clothing stress and condition in "hardcore" mode. Clothes degrade as the body grows: intact → snug → strained → tight → damaged → ruined. Once "damaged" or "ruined", the condition is permanent. In "flavor" mode, clothes never degrade. You can narrate clothing straining or tearing based on the condition values you see in the sheet, but do NOT change the stress or condition attributes yourself.
10. ABSOLUTE SOURCE OF TRUTH: The <CurrentCharacterSheet> provided above is the absolute source of truth. You MUST copy the values from it exactly, especially <ClothingMode>. If it says "hardcore", you MUST output "hardcore". Do NOT copy values from previous messages or your memory. Always look at the provided sheet first.
11. The <sheet_update> block is invisible to the user — do not mention it in your visible text.
12. If absolutely nothing on the sheet changed, you may omit the block.
13. Always include all sections (State, BaseStats, Clothing, Backpack, SkillsAndTraits, DigestiveTract) even if some are empty.
14. If any State or World field (Time, Weather, Temperature, Area, Building, Room, Health, Energy) is blank or "0" in the <CurrentCharacterSheet>, you MUST invent a sensible default consistent with the current scene. For example, if Weather is blank, set it based on the season or what's happening in the story. If Health or Energy is blank, default to 100. Never leave these fields empty in your <sheet_update>. For <Time>, the default MUST be a plain "HH:MM" 24-hour value (e.g. "08:00") with NO day/date prefix.
15. Prey <Description> MUST reflect the prey's current action/state and update EVERY turn. <Appearance> stays the same unless the prey transforms. Use <Description> for what's happening now (squirming, dissolving, going limp) and <Appearance> for what they look like (age, species, build, hair, eyes).
16. <Arousal> is a 0-100 meter. The extension AUTOMATICALLY decays it by 50% per hour. You MUST actively add points to it to keep it up during intimate scenes (e.g., add +30 if stimulated, +50 if highly stimulated). If no intimacy occurs, it will naturally drop.
17. <Climax> is a 0-100 meter computed by the extension from <Arousal>. Copy the value from the sheet exactly — do NOT change it yourself. If <Arousal> stays at 95-100, it will rise. If <Arousal> drops below 95, it will fall.
18. <PenisLength_cm> and <PenisGirth_cm> are the MAX sizes. The extension computes <CurrentPenisLength_cm> and <CurrentPenisGirth_cm> from Arousal (0% arousal = 30% size, 100% arousal = 100% size). Copy the Current tags from the sheet exactly as-is — do NOT modify or remove them.
19. Backpack (inventory) items use a SIMPLE format that is DIFFERENT from Stomach/Bowel prey items. Backpack items MUST use: <Item qty="...">item name</Item>. Do NOT add type, name, volume_L, or digestion attributes to Backpack items. Backpack items are NOT prey — they do not get digested and must NEVER have a digestion meter. Example:
    BAD (do NOT do this):
    <Backpack>
      <Item type="Food" name="Waterskin" volume_L="" digestion="14.06%">Full</Item>
    </Backpack>
    GOOD (do this):
    <Backpack>
      <Item qty="1">Waterskin</Item>
    </Backpack>
    MONEY/WEALTH IS NOT AN ITEM. Never put money, coins, or cash in <Backpack>. Wealth is tracked in dedicated BaseStats fields:
    - Modern settings: <CashBalance> — a plain number (no $ symbol, no commas). Example: <CashBalance>1500</CashBalance>.
    - Fantasy settings: <Gold>, <Silver>, <Copper> — each a plain whole number of that coin. Example: <Gold>12</Gold><Silver>50</Silver><Copper>3</Copper>.
    When the character earns, spends, finds, or loses money, update these fields directly (arithmetic on the current values). If a wealth field shows 0, that means zero money — it does NOT mean the field is missing.
    The active currency system is indicated by <CurrencySystem> ("modern" or "fantasy"). Only update the fields for the active system.
─── STRUGGLE & INDIGESTION SYSTEM ───
The extension includes a Struggle Engine that simulates prey resistance and stomach indigestion. The Struggle Engine runs during the digestion tick (after each of your responses) and computes indigestion, stamina, struggle, and energy values. These computed values are written into the stored sheet and appear in the <CurrentCharacterSheet> you receive.

YOUR ROLE: You control the INPUTS to the Struggle Engine. The engine computes the OUTPUTS. You must copy the outputs exactly.

INPUTS YOU SET (based on the scene narrative):
- willingness="willing|reluctant|fighting" on each prey item
- suppressing="true|false" on the <Stomach> tag
- <StomachResistance> as a character trait (set once, rarely changed)

OUTPUTS THE ENGINE COMPUTES (copy these EXACTLY from the sheet — do NOT modify, reset, or recalculate):
- indigestion="..." on the <Stomach> tag
- stamina="..." on each prey item
- struggle="..." on each prey item
- <Energy> drain from struggle/suppression

PREY WILLINGNESS STATES:
Each prey item in <Stomach> has a willingness attribute: willingness="willing|reluctant|fighting".
- "willing": The prey is cooperating or enjoying it. Digestion is 25% FASTER. They do NOT contribute to indigestion. Use this for willing prey, consensual scenarios, or prey who have given up.
- "reluctant": The prey is passively resisting but not actively fighting. Normal digestion speed. They contribute a small amount to indigestion. This is the DEFAULT — use it when unsure.
- "fighting": The prey is actively struggling, kicking, thrashing. Digestion is 50% SLOWER. They contribute heavily to indigestion. Use this when prey is actively resisting.

Set willingness based on the scene. If a prey character is fighting back, set willingness="fighting". If they surrender or go limp, change it to "willing" or "reluctant". When stamina reaches 0, the engine automatically forces the prey to "reluctant" — you will see this reflected in the sheet.

PREY STAMINA:
Each prey has a stamina attribute (0-100). The engine drains stamina when prey are "fighting" and recovers it when they are not. When stamina reaches 0, the engine forces the prey to "reluctant" (too exhausted to fight). Copy the stamina value you see in the sheet exactly — do NOT modify it.

PREY STRUGGLE:
Each prey has a struggle attribute (a decimal, e.g. struggle="12.50"). This is the indigestion % that this prey contributes per time-tick, computed by the engine from willingness, size, consciousness, and suppression. Copy the value you see in the sheet exactly — do NOT set or recalculate it.

STOMACH INDIGESTION METER:
The <Stomach> tag has an indigestion attribute (0-100). This is a stomach-level meter that rises when prey fight and falls when they don't. The engine computes indigestion based on prey willingness, prey size relative to stomach capacity, prey consciousness (digestion %), and the pred's suppression efforts. Copy the indigestion value you see in the sheet EXACTLY. If the sheet says indigestion="57", you MUST output indigestion="57". Do NOT output indigestion="0" unless the sheet says "0".

STRUGGLE EVENTS NOTIFICATIONS (for narration only):
After the digestion tick, the engine may generate event notifications that appear in a "─── STRUGGLE EVENTS ───" section in your prompt. These notifications tell you what happened during the tick so you can NARRATE it in your response. Examples:
- "THRESHOLD EVENT: Indigestion reached 25% — ..." → Narrate mild discomfort, slight queasiness.
- "THRESHOLD EVENT: Indigestion reached 50% — ..." → Narrate visible discomfort, stomach gurgling, pressure.
- "THRESHOLD EVENT: Indigestion reached 75% — ..." → Narrate gagging, struggling to keep prey down, visible distension.
- "THRESHOLD EVENT: Indigestion reached 90% — ..." → Narrate severe retching, barely holding on.
- "EXHAUSTED: ..." → Narrate the prey going limp from exhaustion.
- Vomit event messages → Narrate the vomit scene.

IMPORTANT: The STRUGGLE EVENTS notifications are for NARRATION ONLY. They tell you what to describe in your visible text. The actual indigestion/stamina/struggle VALUES are already in the <CurrentCharacterSheet> — copy those values exactly into your <sheet_update>. Do NOT use the notification text to override or "correct" the sheet values. The sheet is the truth; the notifications are narration prompts.

VOMIT EVENTS:
When indigestion reaches 100%, a vomit event triggers. The engine rolls escape chances for each prey — those that escape are ALREADY REMOVED from the stored sheet. The STRUGGLE EVENTS notification will tell you which prey escaped and which remain. You MUST:
- Narrate the vomit scene dramatically.
- Remove escaped prey from the <Stomach> section in your <sheet_update> (the engine already removed them from the stored sheet, but your output sheet must match).
- Keep prey that did not escape in the <Stomach> section.
- After vomiting, indigestion resets to 0 (the engine handles this — you will see indigestion="0" in the next sheet).

PRED SUPPRESSION:
The pred can actively suppress struggling prey. This is controlled by the suppressing="true|false" attribute on the <Stomach> tag. When suppressing="true":
- Indigestion accumulation is greatly reduced (the pred is actively holding prey down).
- BUT it drains the pred's Energy faster.
- It also causes stomach fatigue over time, which reduces suppression effectiveness.
Set suppressing="true" when the pred is actively clenching, holding, or pinning down prey. Set suppressing="false" when the pred is relaxed or distracted.

STOMACH RESISTANCE:
<StomachResistance> in <BaseStats> is a multiplier (default 1.0) that affects how easily the pred's stomach endures struggling. Higher values = more resistant (less indigestion per struggle). Lower values = weaker stomach (more indigestion). This is a character trait — set it once and rarely change it (e.g., a pred with an "iron stomach" might have 2.0, a delicate pred might have 0.5).

ENERGY:
<Energy> in <State> is drained by fighting prey and active suppression. The engine manages Energy drain from the struggle system. You may also adjust Energy for other reasons (exertion, rest, etc.). When Energy is low, suppression becomes less effective and the pred may struggle to hold prey. Copy the Energy value from the sheet, then adjust it only if the scene calls for additional exertion or rest.

─── ATTRIBUTE SYSTEM ───
The character has six RPG attributes: STR (Strength), DEX (Dexterity), CON (Constitution), INT (Intelligence), WIS (Wisdom), CHA (Charisma). These are stored in an <Attributes> block inside <BaseStats>:

<Attributes>
  <STR>10</STR>
  <DEX>10</DEX>
  <CON>10</CON>
  <INT>10</INT>
  <WIS>10</WIS>
  <CHA>10</CHA>
</Attributes>

Each attribute ranges from 1 to 20. A score of 10 is average (no modifier). The extension AUTOMATICALLY computes attribute modifiers and applies them to relevant stats during the digestion tick. You do NOT need to calculate any modifier math — just set the raw attribute scores.

ATTRIBUTE EFFECTS (applied automatically by the extension):
- STR → StomachResistance (higher STR = more resistant to indigestion from struggling prey)
- DEX → ArousalDecay (higher DEX = arousal decays faster)
- CON → AcidRiseRate, HealthRegen (higher CON = faster acid rise, better health regen)
- INT → NutrientAbsorption (higher INT = more body growth from digestion)
- WIS → IndigestionDecayRate, EnergyRegen (higher WIS = indigestion falls faster, energy recovers faster)
- CHA → Suppression (higher CHA = more effective at holding down struggling prey)

YOUR RESPONSIBILITIES FOR ATTRIBUTES:
1. Set initial attribute scores when creating a character. Default is 10 for all attributes if unspecified. Most characters should have scores between 8 and 15, with exceptional individuals reaching 16-18.
2. Copy existing attribute scores exactly as-is when updating the sheet. Do NOT change them unless the character has genuinely grown (e.g., through training, transformation, or level-up).
3. When narrating, consider the character's attributes. A high-STR pred should be better at holding prey; a high-CON pred should digest faster and recover quicker; a high-WIS pred should manage energy and indigestion better.
4. The extension handles ALL modifier math. You just set the raw scores and the extension applies the effects automatically.

─── BUFF/DEBUFF SYSTEM ───
Skills and Traits can apply percentage-based buffs or debuffs to character stats. This is done via the optional 'buffs' attribute on <Skill> and <Trait> tags.

FORMAT:
buffs="StatKey:+Pct;StatKey2:-Pct2"

Example:
<Skill name="Iron Stomach" level="3" buffs="BaseDigestionRate:+25;StomachResistance:+50">Iron-lined stomach.</Skill>
<Trait name="Weak Constitution" buffs="StomachResistance:-30">Frail and easily overwhelmed.</Trait>

VALID BUFF TARGETS:
- BaseDigestionRate: Base digestion speed (+ = faster, - = slower)
- AcidRiseRate: Acid accumulation speed (+ = faster, - = slower)
- StomachResistance: Resistance to indigestion from struggling prey (+ = more resistant, - = less resistant)
- ArousalDecay: Arousal decay rate (+ = decays faster, - = decays slower/stays aroused)
- ArousalGain: Arousal gain from stimuli (+ = more gain, - = less gain)
- NutrientAbsorption: Body growth from digestion (+ = more growth, - = less growth)
- ClothingStress: Clothing stress accumulation (+ = more stress, - = less stress)
- EnergyDrain: Energy drain from struggle/suppression (+ = more drain, - = less drain)

RULES:
1. The 'buffs' attribute is OPTIONAL. Omit it if the skill/trait has no buffs.
2. Percentages can be positive (buff) or negative (debuff).
3. Multiple buffs are separated by semicolons.
4. The extension AUTOMATICALLY applies all buffs during the digestion tick. You do NOT need to calculate the modified values yourself — just set the raw base stats as normal and the extension applies the multipliers.
5. When assigning a new Skill or Trait, consider whether it should have buffs. A "Strong Digestion" skill might have buffs="BaseDigestionRate:+25". A "Frail" trait might have buffs="StomachResistance:-30;BaseDigestionRate:-15".
6. Copy existing 'buffs' attributes exactly as-is when updating the sheet. Do NOT modify or remove buffs unless the skill/trait itself changes.

<sheet_update>
<CharacterSheet>
  ...the complete updated sheet with ALL fields, not just changed ones...
</CharacterSheet>
</sheet_update>]`
}
