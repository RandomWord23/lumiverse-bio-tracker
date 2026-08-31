declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import { type PreyData } from './types'
import { getStat, setStat, getAttrFromString, maybeToast } from './engine'

export function processStruggle(
  xml: string,
  oldXml: string,
  elapsed: number,
  stomachResistanceMult: number = 0,
  energyDrainMult: number = 0,
): { xml: string; struggleEvents: string[] } {
  const struggleEvents: string[] = []

  // --- Read stomach tag ---
  const stomMatch = xml.match(/<Stomach([^>]*)>([\s\S]*?)<\/Stomach>/i)
  if (!stomMatch) return { xml, struggleEvents }

  const stomAttrs = stomMatch[1]
  const stomContent = stomMatch[2]

  // --- Read OLD stomach tag for clamping struggle state ---
  const oldStomMatch = oldXml.match(/<Stomach([^>]*)>([\s\S]*?)<\/Stomach>/i)
  const oldStomAttrs = oldStomMatch ? oldStomMatch[1] : ''
  const oldStomContent = oldStomMatch ? oldStomMatch[2] : ''

  // --- Build a map of prey name -> stamina from the OLD (stored) sheet so
  // the LLM cannot artificially restore a prey's stamina to let them fight
  // longer than the engine allows. ---
  const oldPreyStaminaMap = new Map<string, number>()
  const oldItemRegex = /<Item\s+([^>]+?)[\s/]*>/gi
  let oldItemMatch: RegExpExecArray | null
  while ((oldItemMatch = oldItemRegex.exec(oldStomContent)) !== null) {
    const itemAttrs = oldItemMatch[1]
    if ((getAttrFromString(itemAttrs, 'type') || 'Food') !== 'Prey') continue
    const preyName = getAttrFromString(itemAttrs, 'name')
    if (preyName) {
      oldPreyStaminaMap.set(preyName, parseFloat(getAttrFromString(itemAttrs, 'stamina')) || 100)
    }
  }

  // --- Read configuration stats from the OLD (stored) sheet so the LLM
  // cannot artificially inflate resistance/decay rates or lower capacity. ---
  const height = getStat(oldXml, 'Height_cm') || 160
  const weight = getStat(oldXml, 'Weight_kg') || 60
  const capacityMult = getStat(oldXml, 'CapacityMultiplier') || 1.0
  const stomachMaxCapacity = height * weight * 0.012 * capacityMult

  const stomachResistance = Math.max(0.1, (getStat(oldXml, 'StomachResistance') || 1.0) * (1 + stomachResistanceMult))
  const baseIndigestionRate = getStat(oldXml, 'BaseIndigestionRate') || 30
  const indigestionDecayRate = getStat(oldXml, 'IndigestionDecayRate') || 20
  const stomachResistanceFactor = 1.0 / stomachResistance

  // --- Read struggle state, clamped against the OLD sheet so the LLM
  // cannot "reset" energy, indigestion, or stomach fatigue to lower values. ---
  const oldEnergy = getStat(oldXml, 'Energy') || 100
  let energy = Math.max(getStat(xml, 'Energy') || oldEnergy, oldEnergy)

  const oldIndigestion = parseFloat(getAttrFromString(oldStomAttrs, 'indigestion')) || 0
  const llmIndigestion = parseFloat(getAttrFromString(stomAttrs, 'indigestion'))
  let indigestion = Math.max(
    isNaN(llmIndigestion) ? oldIndigestion : (llmIndigestion || oldIndigestion),
    oldIndigestion,
  )
  spindle.log.info(
    `[Struggle] indigestion: old=${oldIndigestion.toFixed(2)}, ` +
      `llm=${isNaN(llmIndigestion) ? 'omitted' : llmIndigestion}, ` +
      `clamped=${indigestion.toFixed(2)}`,
  )

  const suppressing = getAttrFromString(stomAttrs, 'suppressing') === 'true'

  const oldStomachFatigue =
    parseFloat(getAttrFromString(oldStomAttrs, 'stomachFatigue')) || 0
  let stomachFatigue = Math.max(
    parseFloat(getAttrFromString(stomAttrs, 'stomachFatigue')) || oldStomachFatigue,
    oldStomachFatigue,
  )

  // Fall back to the OLD sheet's indigestionEvents if the LLM omitted it.
  // Without this, thresholds (25%/50%/75%/90%) re-fire on every tick
  // because the LLM's sheet doesn't carry forward the triggered set.
  let triggeredStr =
    getAttrFromString(stomAttrs, 'indigestionEvents') ||
    getAttrFromString(oldStomAttrs, 'indigestionEvents') ||
    ''
  const triggeredSet = new Set(triggeredStr.split(',').filter(Boolean))

  // --- Helper: write Stomach tag with updated attrs + content ---
  const updateStomachTag = (content: string): string => {
    return xml.replace(
      /<Stomach([^>]*)>[\s\S]*?<\/Stomach>/i,
      (_match, attrs) => {
        let newAttrs = attrs
          .replace(/\s+indigestion="[^"]*"/gi, '')
          .replace(/\s+stomachFatigue="[^"]*"/gi, '')
          .replace(/\s+indigestionEvents="[^"]*"/gi, '')
          .trim()
        newAttrs += ` indigestion="${indigestion.toFixed(2)}" stomachFatigue="${stomachFatigue.toFixed(2)}" indigestionEvents="${triggeredStr}"`
        return `<Stomach${newAttrs}>\n${content}\n    </Stomach>`
      },
    )
  }

  // --- Collect prey data (first pass: scan, no modification) ---
  const preyData: PreyData[] = []

  const collectPrey = (attrs: string, inner: string | null, isSelfClosing: boolean): void => {
    if ((getAttrFromString(attrs, 'type') || 'Food') !== 'Prey') return

    const name = getAttrFromString(attrs, 'name')
    const vol = parseFloat(getAttrFromString(attrs, 'volume_L')) || 0
    const digPct = parseFloat((getAttrFromString(attrs, 'digestion') || '0').replace('%', '')) || 0
    let willingness = (getAttrFromString(attrs, 'willingness') || 'reluctant').toLowerCase()
    // Clamp stamina against the OLD sheet so the LLM cannot restore a prey's
    // stamina to let them fight longer than the engine allows.
    const oldStamina = oldPreyStaminaMap.get(name) ?? 100
    let stamina = Math.max(
      parseFloat(getAttrFromString(attrs, 'stamina')) || oldStamina,
      oldStamina,
    )

    // Consciousness factor from digestion %
    let consciousnessFactor: number
    if (digPct < 50) consciousnessFactor = 1.0
    else if (digPct < 70) consciousnessFactor = 0.5
    else if (digPct < 85) consciousnessFactor = 0.1
    else consciousnessFactor = 0.0

    // Size factor
    const sizeFactor = stomachMaxCapacity > 0 ? Math.min(2.0, vol / stomachMaxCapacity) : 1.0

    // Willingness factor
    let willingnessFactor: number
    if (willingness === 'willing') willingnessFactor = 0
    else if (willingness === 'fighting') willingnessFactor = 1.0
    else willingnessFactor = 0.25

    // Stamina drain (fighting) or recovery (not fighting)
    if (willingness === 'fighting') {
      const staminaLoss = 3 * elapsed * sizeFactor
      stamina = Math.max(0, stamina - staminaLoss)
      if (stamina <= 0) {
        willingness = 'reluctant'
        willingnessFactor = 0.25
        struggleEvents.push(
          `EXHAUSTED: "${name}" has run out of stamina and can no longer fight — they've gone limp.`,
        )
      }
    } else {
      stamina = Math.min(100, stamina + 5 * elapsed)
    }

    // Personal struggle contribution (raw, before suppression/resistance)
    const personalStruggle =
      baseIndigestionRate * elapsed * consciousnessFactor * sizeFactor * willingnessFactor

    preyData.push({
      name,
      volume: vol,
      digestionPct: digPct,
      willingness,
      stamina,
      consciousnessFactor,
      sizeFactor,
      willingnessFactor,
      personalStruggle,
      effectiveStruggle: 0,
      escaped: false,
      attrs,
      inner,
      isSelfClosing,
    })
  }

  // Pass 1: non-self-closing Prey items
  stomContent.replace(
    /<Item\s+([^>]*[^>\/])\s*>([\s\S]*?)<\/Item>/gi,
    (match, attrs, inner) => {
      collectPrey(attrs, inner, false)
      return match
    },
  )
  // Pass 2: self-closing Prey items
  stomContent.replace(/<Item\s+([^>]+?)\s*\/>/gi, (match, attrs) => {
    collectPrey(attrs, null, true)
    return match
  })

  // --- No prey: decay indigestion + recover energy ---
  if (preyData.length === 0) {
    const hasItems = stomContent.includes('<Item')
    indigestion = Math.max(0, indigestion - indigestionDecayRate * elapsed * 2.0)
    energy = Math.min(100, energy + (hasItems ? 3 : 5) * elapsed)
    stomachFatigue = Math.max(0, stomachFatigue - 2 * elapsed)

    xml = updateStomachTag(stomContent.trim())
    xml = setStat(xml, 'Energy', energy)
    return { xml, struggleEvents }
  }

  // --- Compute totals ---
  let totalIndigestionGain = 0
  let totalStruggle = 0
  let numFighting = 0

  for (const prey of preyData) {
    totalIndigestionGain += prey.personalStruggle * stomachResistanceFactor
    totalStruggle += prey.personalStruggle
    if (prey.willingness === 'fighting') numFighting++
  }

  // (effectiveStruggle is filled in after suppressionFactor is known — see below)

  const anyFighting = numFighting > 0

  // --- Suppression factor ---
  let suppressionFactor: number
  if (energy <= 0) {
    suppressionFactor = 1.0
  } else if (suppressing) {
    if (stomachFatigue > 20) suppressionFactor = 0.7
    else if (stomachFatigue > 10) suppressionFactor = 0.5
    else suppressionFactor = 0.3
    if (energy <= 20) suppressionFactor = Math.min(1.0, suppressionFactor + 0.2)
  } else {
    suppressionFactor = energy <= 20 ? 0.85 : 0.7
  }

  totalIndigestionGain *= suppressionFactor

  // --- Per-prey effective struggle (for UI display) ---
  for (const prey of preyData) {
    prey.effectiveStruggle = prey.personalStruggle * stomachResistanceFactor * suppressionFactor
  }

  // --- Update indigestion (accumulate or decay) ---
  if (anyFighting) {
    indigestion = Math.min(100, indigestion + totalIndigestionGain)
    spindle.log.info(
      `[Struggle] ACCUMULATE: +${totalIndigestionGain.toFixed(2)} → indigestion=${indigestion.toFixed(2)}`,
    )
  } else {
    const allWilling = preyData.every((p) => p.willingness === 'willing')
    const decayMult = allWilling ? 2.0 : 1.0
    indigestion = Math.max(0, indigestion - indigestionDecayRate * elapsed * decayMult)
    spindle.log.info(
      `[Struggle] DECAY: -${(indigestionDecayRate * elapsed * decayMult).toFixed(2)} → indigestion=${indigestion.toFixed(2)}`,
    )
  }

  // --- Energy drain / recovery ---
  if (anyFighting) {
    const fightingStruggle =
      suppressionFactor *
      preyData
        .filter((p) => p.willingness === 'fighting')
        .reduce((sum, p) => sum + p.personalStruggle * stomachResistanceFactor, 0)
    let energyDrain = fightingStruggle * 0.5 * (1 + energyDrainMult)
    if (suppressing && energy > 0) {
      energyDrain += numFighting * 2 * elapsed * (1 + energyDrainMult)
    }
    energy = Math.max(0, energy - energyDrain)
  } else {
    energy = Math.min(100, energy + 3 * elapsed)
  }

  // --- Stomach fatigue ---
  if (suppressing && energy > 0 && anyFighting) {
    stomachFatigue += numFighting * 1 * elapsed
  } else if (!suppressing) {
    stomachFatigue = Math.max(0, stomachFatigue - 2 * elapsed)
  }

  // --- Threshold events (one-shot) ---
  const thresholds = [
    {
      pct: 25,
      id: 'discomfort',
      msg: 'The pred feels mild discomfort in their stomach — slight nausea, prey movements are noticeable.',
    },
    {
      pct: 50,
      id: 'distress',
      msg: "The pred's belly is visibly bulging and shifting — onlookers can see something is alive inside. The pred feels significant nausea.",
    },
    {
      pct: 75,
      id: 'gag',
      msg: 'The pred feels a strong urge to retch — involuntary gagging, difficulty keeping prey down. Vomit is approaching.',
    },
    {
      pct: 90,
      id: 'critical',
      msg: 'The pred is on the verge of vomiting — they can barely hold the prey down. One more struggle could trigger it.',
    },
  ]

  for (const t of thresholds) {
    if (indigestion >= t.pct && !triggeredSet.has(t.id)) {
      triggeredSet.add(t.id)
      struggleEvents.push(`THRESHOLD EVENT: Indigestion reached ${t.pct}% — ${t.msg}`)
      maybeToast('struggleEvents', 'warning', `Indigestion ${t.pct}%: ${t.id}`)
    }
  }

  // --- Vomit event (indigestion ≥ 100) ---
  if (indigestion >= 100) {
    indigestion = 100
    const escapedPrey: string[] = []
    const remainingPrey: string[] = []

    for (const prey of preyData) {
      const struggleShareFactor =
        totalStruggle > 0
          ? 0.5 + 0.5 * (prey.personalStruggle / totalStruggle)
          : 0.5
      const escapeChance = 0.9 * prey.consciousnessFactor * struggleShareFactor
      if (Math.random() < escapeChance) {
        prey.escaped = true
        escapedPrey.push(prey.name)
      } else {
        remainingPrey.push(prey.name)
      }
    }

    let vomitMsg = 'VOMIT: The pred has vomited!'
    if (escapedPrey.length > 0) {
      vomitMsg += ` The following prey escaped: ${escapedPrey.map((n) => `"${n}"`).join(', ')}.`
      vomitMsg +=
        ' Remove them from the Stomach section in your sheet_update (the extension has already removed them from the stored sheet). Narrate the vomit scene.'
    } else {
      vomitMsg += ' No prey managed to escape — they all remain in the stomach. Narrate the vomit scene.'
    }
    if (remainingPrey.length > 0) {
      vomitMsg += ` ${remainingPrey.map((n) => `"${n}"`).join(', ')} did not escape and remain${remainingPrey.length === 1 ? 's' : ''} in the stomach.`
    }
    struggleEvents.push(vomitMsg)
    maybeToast('vomitEvents', 'warning', `🤢 Vomit event! ${escapedPrey.length} prey escaped.`)

    // Post-vomit reset
    indigestion = 0
    energy = Math.max(0, energy - 20)
    stomachFatigue = Math.max(0, stomachFatigue - 5)
    triggeredSet.clear()
  }

  triggeredStr = Array.from(triggeredSet).join(',')

  // --- Update XML: remove escaped prey, update willingness/stamina on remaining ---
  let preyIdx = 0
  let newStomContent = stomContent.replace(
    /<Item\s+([^>]*[^>\/])\s*>([\s\S]*?)<\/Item>/gi,
    (match, attrs, inner) => {
      if ((getAttrFromString(attrs, 'type') || 'Food') !== 'Prey') return match
      const prey = preyData[preyIdx++]
      if (prey.escaped) return ''
      let newAttrs = attrs
        .replace(/\s+willingness="[^"]*"/gi, '')
        .replace(/\s+stamina="[^"]*"/gi, '')
        .replace(/\s+struggle="[^"]*"/gi, '')
        .trim()
      newAttrs += ` willingness="${prey.willingness}" stamina="${prey.stamina.toFixed(2)}" struggle="${prey.effectiveStruggle.toFixed(2)}"`
      return `<Item ${newAttrs}>${inner}</Item>`
    },
  )
  newStomContent = newStomContent.replace(
    /<Item\s+([^>]+?)\s*\/>/gi,
    (match, attrs) => {
      if ((getAttrFromString(attrs, 'type') || 'Food') !== 'Prey') return match
      const prey = preyData[preyIdx++]
      if (prey.escaped) return ''
      let newAttrs = attrs
        .replace(/\s+willingness="[^"]*"/gi, '')
        .replace(/\s+stamina="[^"]*"/gi, '')
        .replace(/\s+struggle="[^"]*"/gi, '')
        .trim()
      newAttrs += ` willingness="${prey.willingness}" stamina="${prey.stamina.toFixed(2)}" struggle="${prey.effectiveStruggle.toFixed(2)}"`
      return `<Item ${newAttrs} />`
    },
  )

  // Clean up empty lines from removed prey
  newStomContent = newStomContent.replace(/^\s*\n/gm, '').trim()

  // --- Write back to XML ---
  xml = updateStomachTag(newStomContent)
  xml = setStat(xml, 'Energy', energy)

  // Verify the write-back actually persisted indigestion into the XML
  const verifyMatch = xml.match(/<Stomach[^>]*\sindigestion="([^"]*)"/i)
  spindle.log.info(
    `[Struggle] WRITE-BACK: indigestion=${indigestion.toFixed(2)}, ` +
      `xml attr="${verifyMatch ? verifyMatch[1] : 'MISSING'}", ` +
      `energy=${energy.toFixed(1)}, ${numFighting} fighting, fatigue=${stomachFatigue.toFixed(1)}`,
  )

  return { xml, struggleEvents }
}
