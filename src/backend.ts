declare const spindle: import('lumiverse-spindle-types').SpindleAPI

interface Snapshot {
  messageId: string
  sheetXml: string
  chatIndex: number
}

let activeChatId: string | null = null
let pendingGenerationType: string = 'normal'
const sheets: Map<string, string> = new Map()
const snapshots: Map<string, Snapshot[]> = new Map()
const committedMessageIds: Set<string> = new Set()

// ─── Settings (received from frontend) ──────────────────────
let toastSettings: Record<string, boolean> = {
  digestionTicks: true, climaxEvents: true, clothingDamage: true,
  nutrientAbsorption: false, digestionSkips: false, sheetSync: true,
  rollbackEvents: true, rollbackWarnings: true, errors: true, chatWarnings: false,
  struggleEvents: true, vomitEvents: true,
}
let engineToggles: Record<string, boolean> = {
  digestionEngine: true, clothingStress: true, nutrientAbsorption: true, arousalClimax: true,
  struggleEngine: true, buffSystem: true,
  attributeSystem: false,
}

function maybeToast(category: string, type: 'success' | 'warning' | 'error' | 'info', message: string) {
  if (toastSettings[category] === false) return
  spindle.toast[type](message)
}

function sheetPath(chatId: string) {
  return `sheets/${chatId}.xml`
}
function snapshotsPath(chatId: string) {
  return `snapshots/${chatId}.json`
}

async function loadChatSheet(chatId: string) {
  try {
    const data = await spindle.storage.read(sheetPath(chatId))
    if (data) {
      sheets.set(chatId, data)
      return data
    }
  } catch (e) {}
  return null
}

async function saveChatSheet(chatId: string, xml: string) {
  sheets.set(chatId, xml)
  await spindle.storage.write(sheetPath(chatId), xml)
}

async function loadChatSnapshots(chatId: string) {
  try {
    const data = await spindle.storage.read(snapshotsPath(chatId))
    if (data) {
      snapshots.set(chatId, JSON.parse(data))
    } else {
      snapshots.set(chatId, [])
    }
  } catch (e) {
    snapshots.set(chatId, [])
  }
}

async function saveChatSnapshots(chatId: string) {
  const list = snapshots.get(chatId) || []
  await spindle.storage.write(snapshotsPath(chatId), JSON.stringify(list))
}

async function switchToChat(chatId: string | null) {
  activeChatId = chatId
  committedMessageIds.clear()
  if (!chatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: '' })
    return
  }
  const sheet = await loadChatSheet(chatId)
  await loadChatSnapshots(chatId)
  spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: sheet || '' })
  spindle.log.info(`Switched to chat ${chatId}`)
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('\n')
  }
  return ''
}

function extractSheetUpdate(content: unknown): string | null {
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

function findLastAssistantMessage(messages: any[]): any | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.__isChatHistory) return msg
  }
  return null
}

function getAttrFromString(str: string, attr: string): string {
  const match = str.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
  return match ? match[1] : ''
}

function collectBuffs(xml: string): Record<string, number> {
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
function applyModifierCap(modifiers: Record<string, number>): Record<string, number> {
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
function collectModifiers(xml: string): Record<string, number> {
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

/** Maps each attribute key to the stat keys it influences. */
const ATTRIBUTE_STAT_MAP: Record<string, string[]> = {
  STR: ['StomachResistance'],
  DEX: ['ArousalDecay'],
  CON: ['AcidRiseRate', 'HealthRegen'],
  INT: ['NutrientAbsorption'],
  WIS: ['IndigestionDecayRate', 'EnergyRegen'],
  CHA: ['Suppression'],
}

const ATTRIBUTE_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const
const ATTRIBUTE_MODIFIER_WEIGHT = 0.05

/** Read a single attribute score from the <Attributes> XML block. */
function getAttribute(xml: string, key: string): number {
  const match = xml.match(new RegExp(`<${key}>(.*?)<\\/${key}>`, 'i'))
  return match ? parseFloat(match[1]) || 10 : 10
}

/** Compute the D&D-style modifier for a score: floor((score - 10) / 2). */
function attributeModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * Parse the <Attributes> block and return a modifier map keyed by stat name.
 * Each attribute's modifier × 0.05 is added to every stat it influences.
 */
function processAttributes(xml: string): Record<string, number> {
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

function getStat(xml: string, tag: string): number {
  const match = xml.match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`, 'i'))
  return match ? parseFloat(match[1]) || 0 : 0
}

function setStat(xml: string, tag: string, value: number): string {
  const regex = new RegExp(`<${tag}>.*?<\\/${tag}>`, 'i')
  const replacement = `<${tag}>${value.toFixed(2)}</${tag}>`
  if (regex.test(xml)) {
    return xml.replace(regex, replacement)
  }
  if (xml.includes('</BaseStats>')) {
    return xml.replace(
      /<\/BaseStats>/i,
      `    <${tag}>${value.toFixed(2)}</${tag}>\n  </BaseStats>`,
    )
  }
  return xml
}

const conditionThresholds: Record<string, number[]> = {
  rigid: [5, 10, 20, 30, 40],
  standard: [10, 20, 35, 50, 70],
  stretchy: [20, 40, 60, 80, 100],
  magic: [Infinity, Infinity, Infinity, Infinity, Infinity],
}

const conditionNames = ['snug', 'strained', 'tight', 'damaged', 'ruined']

const slotBodyMap: Record<string, string[]> = {
  'Head Top': ['weight'],
  'Face': ['weight'],
  'Head Lower': ['weight'],
  'Neck': ['weight'],
  'Underwear Top': ['weight', 'breasts'],
  'Underwear Bottom': ['weight', 'hips', 'penis'],
  'Torso Base': ['weight', 'height', 'breasts'],
  'Torso Mid': ['weight', 'height', 'breasts'],
  'Torso Outer': ['weight', 'height', 'breasts'],
  'Torso Shell': ['weight', 'height', 'breasts'],
  'Hands Base': ['weight'],
  'Hands Outer': ['weight'],
  'Legs Base': ['weight', 'height', 'hips', 'penis'],
  'Legs Outer': ['weight', 'height', 'hips'],
  'Feet Base': ['weight', 'height'],
  'Feet Outer': ['weight', 'height'],
  'Jewelry': ['weight'],
  'Back': ['weight'],
  'Waist': ['weight', 'hips'],
}

const stressMultipliers: Record<string, number> = {
  height: 1.0,
  weight: 1.0,
  breasts: 0.1,
  hips: 2.0,
  penis: 1.0,
}

function deriveCondition(
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

function processClothingStress(
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

function digestItemsInContent(
  content: string,
  ctx: {
    baseDigRate: number
    acidMultiplier: number
    elapsed: number
    oldDigestionMap: Map<string, number>
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

    let digNum = parseFloat(getAttrFromString(attrs, 'digestion').replace('%', '')) || 0
    // Prevent rollback: never let digestion drop below the previously stored value
    const oldDigNum = ctx.oldDigestionMap.get(name) ?? 0
    digNum = Math.max(digNum, oldDigNum)
    const digIncrease = ctx.baseDigRate * speedMult * ctx.acidMultiplier * ctx.elapsed
    digNum = Math.min(100, digNum + digIncrease)

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
      const willingness = getAttrFromString(attrs, 'willingness') || 'reluctant'
      const stamina = getAttrFromString(attrs, 'stamina') || '100'
      preyAttrs = ` willingness="${willingness}" stamina="${stamina}"`
    }
    if (isSelfClosing) {
      return `<Item type="${type}" name="${name}" volume_L="${vol}" digestion="${digNum.toFixed(2)}%"${preyAttrs} />`
    }
    return `<Item type="${type}" name="${name}" volume_L="${vol}" digestion="${digNum.toFixed(2)}%"${preyAttrs}>${inner}</Item>`
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

function processStruggle(
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
  let indigestion = Math.max(
    parseFloat(getAttrFromString(stomAttrs, 'indigestion')) || oldIndigestion,
    oldIndigestion,
  )

  const suppressing = getAttrFromString(stomAttrs, 'suppressing') === 'true'

  const oldStomachFatigue =
    parseFloat(getAttrFromString(oldStomAttrs, 'stomachFatigue')) || 0
  let stomachFatigue = Math.max(
    parseFloat(getAttrFromString(stomAttrs, 'stomachFatigue')) || oldStomachFatigue,
    oldStomachFatigue,
  )

  let triggeredStr = getAttrFromString(stomAttrs, 'indigestionEvents') || ''
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
  interface PreyData {
    name: string
    volume: number
    digestionPct: number
    willingness: string
    stamina: number
    consciousnessFactor: number
    sizeFactor: number
    willingnessFactor: number
    personalStruggle: number
    escaped: boolean
    attrs: string
    inner: string | null
    isSelfClosing: boolean
  }

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

  // --- Update indigestion (accumulate or decay) ---
  if (anyFighting) {
    indigestion = Math.min(100, indigestion + totalIndigestionGain)
  } else {
    const allWilling = preyData.every((p) => p.willingness === 'willing')
    const decayMult = allWilling ? 2.0 : 1.0
    indigestion = Math.max(0, indigestion - indigestionDecayRate * elapsed * decayMult)
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
        .trim()
      newAttrs += ` willingness="${prey.willingness}" stamina="${prey.stamina.toFixed(2)}"`
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
        .trim()
      newAttrs += ` willingness="${prey.willingness}" stamina="${prey.stamina.toFixed(2)}"`
      return `<Item ${newAttrs} />`
    },
  )

  // Clean up empty lines from removed prey
  newStomContent = newStomContent.replace(/^\s*\n/gm, '').trim()

  // --- Write back to XML ---
  xml = updateStomachTag(newStomContent)
  xml = setStat(xml, 'Energy', energy)

  spindle.log.info(
    `Struggle tick: indigestion ${indigestion.toFixed(1)}%, energy ${energy.toFixed(1)}, ` +
      `${numFighting} fighting prey, fatigue ${stomachFatigue.toFixed(1)}`,
  )

  return { xml, struggleEvents }
}

async function runDigestionTick(
  newXml: string,
  oldXml: string,
  chatId: string,
): Promise<string> {
  try {
    const getTimeHours = (xml: string) => {
      const match = xml.match(/<Time>(.*?)<\/Time>/i)
      if (!match) return null
      const timeStr = match[1].trim()
      const parts = timeStr.split(':').map(Number)
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] + parts[1] / 60
      }
      const h = parseFloat(timeStr)
      return isNaN(h) ? null : h
    }

    const oldTime = getTimeHours(oldXml)
    const newTime = getTimeHours(newXml)

    if (oldTime === null || newTime === null) {
      maybeToast('digestionSkips', 'info', 'Digestion tick skipped: missing time')
      spindle.log.info('Digestion tick skipped: missing time')
      if (engineToggles.clothingStress) {
        const clothingResult = processClothingStress(newXml, oldXml)
        if (clothingResult.damageEvents.length > 0) {
          spindle.log.info(`Clothing damage: ${clothingResult.damageEvents.join(', ')}`)
        }
        return clothingResult.xml
      }
      return newXml
    }

    let elapsed = newTime - oldTime

    if (elapsed < 0) {
      if (elapsed < -12) {
        elapsed += 24
        spindle.log.info(`Midnight crossing detected: elapsed adjusted to ${elapsed.toFixed(2)}h`)
      } else {
        maybeToast('digestionSkips', 'info', 'Digestion tick skipped: time went backwards (rollback)')
        spindle.log.info('Digestion tick skipped: time went backwards (rollback)')
        return newXml
      }
    }

    if (elapsed === 0) {
      maybeToast('digestionSkips', 'info', 'Digestion tick skipped: 0 hours elapsed')
      spindle.log.info('Digestion tick skipped: 0 hours elapsed')
      if (engineToggles.clothingStress) {
        const clothingResult = processClothingStress(newXml, oldXml)
        if (clothingResult.damageEvents.length > 0) {
          spindle.log.info(`Clothing damage: ${clothingResult.damageEvents.join(', ')}`)
        }
        return clothingResult.xml
      }
      return newXml
    }

    let updatedXml = newXml
    // Unified modifier pipeline: collects buffs + attributes (+ future sources),
    // sums them additively per stat key, and clamps to ±50%.
    const modifiers = collectModifiers(oldXml)
    let totalDigestedVol = 0
    let wasteCount = 0
    let totalItemCount = 0
    let acidLevel = 0

    if (engineToggles.digestionEngine) {
      // Read acid level and config stats from the OLD (stored) sheet so the
      // LLM cannot artificially lower acid or inflate digestion rates.
      acidLevel = getStat(oldXml, 'CurrentAcidPct')
    const baseDigRate = (getStat(oldXml, 'BaseDigestionRate') || 25) * (1 + (modifiers.BaseDigestionRate || 0))
    const acidRiseRate = (getStat(oldXml, 'AcidRiseRate') || 10) * (1 + (modifiers.AcidRiseRate || 0))

    const stomachMatch = newXml.match(/<Stomach[\s\S]*?>([\s\S]*?)<\/Stomach>/i)
    const stomachContents = stomachMatch ? stomachMatch[1].trim() : ''
    const hasItems = stomachContents.includes('<Item')

    if (hasItems) {
      acidLevel = Math.min(100, acidLevel + acidRiseRate * elapsed)
    } else {
      acidLevel = Math.max(0, acidLevel - acidRiseRate * elapsed)
    }

    const acidMultiplier = 1 + acidLevel / 100

    updatedXml = newXml.replace(
      /<CurrentAcidPct>.*?<\/CurrentAcidPct>/i,
      `<CurrentAcidPct>${acidLevel.toFixed(2)}</CurrentAcidPct>`,
    )

    if (!updatedXml.includes('<CurrentAcidPct>')) {
      if (updatedXml.includes('</BaseStats>')) {
        updatedXml = updatedXml.replace(
          /<\/BaseStats>/i,
          `    <CurrentAcidPct>${acidLevel.toFixed(2)}</CurrentAcidPct>\n  </BaseStats>`,
        )
      } else if (updatedXml.includes('</State>')) {
        updatedXml = updatedXml.replace(
          /<\/State>/i,
          `    <CurrentAcidPct>${acidLevel.toFixed(2)}</CurrentAcidPct>\n  </State>`,
        )
      }
    }

    // Build a map of item name -> digestion % from the old (stored) sheet
    // so we can prevent the LLM from accidentally rolling back digestion values.
    const oldDigestionMap = new Map<string, number>()
    const oldItemRegex = /<Item\s+([^>]+?)[\s/]*>/gi
    let oldItemMatch: RegExpExecArray | null
    while ((oldItemMatch = oldItemRegex.exec(oldXml)) !== null) {
      const oldAttrs = oldItemMatch[1]
      const oldName = getAttrFromString(oldAttrs, 'name')
      if (oldName) {
        const oldDig = parseFloat(getAttrFromString(oldAttrs, 'digestion').replace('%', '')) || 0
        oldDigestionMap.set(oldName, oldDig)
      }
    }

    const stomMatch = updatedXml.match(/<Stomach([^>]*)>([\s\S]*?)<\/Stomach>/i)
    const bowMatch = updatedXml.match(/<Bowels([^>]*)>([\s\S]*?)<\/Bowels>/i)

    let stomContent = stomMatch ? stomMatch[2].trim() : ''
    let bowContent = bowMatch ? bowMatch[2].trim() : ''

    const stomResult = digestItemsInContent(stomContent, {
      baseDigRate,
      acidMultiplier,
      elapsed,
      oldDigestionMap,
    })
    stomContent = stomResult.content

    const bowResult = digestItemsInContent(bowContent, {
      baseDigRate,
      acidMultiplier,
      elapsed,
      oldDigestionMap,
    })
    bowContent = bowResult.content

    const totalDigestedVol = stomResult.totalDigestedVol + bowResult.totalDigestedVol
    let wasteCount = stomResult.wasteCount + bowResult.wasteCount
    const accumulatedWasteVol = stomResult.accumulatedWasteVol + bowResult.accumulatedWasteVol
    const totalItemCount = stomResult.itemCount + bowResult.itemCount

    if (stomResult.newRemains.length > 0) {
      bowContent += '\n' + stomResult.newRemains.join('\n')
    }
    if (bowResult.newRemains.length > 0) {
      bowContent += '\n' + bowResult.newRemains.join('\n')
    }

    if (accumulatedWasteVol > 0) {
      wasteCount++
      const wasteRegex = /<Remains volume_L="([^"]+)">Digestive Waste<\/Remains>/i
      const existingWaste = bowContent.match(wasteRegex)
      if (existingWaste) {
        const oldVol = parseFloat(existingWaste[1]) || 0
        const newVol = oldVol + accumulatedWasteVol
        bowContent = bowContent.replace(
          wasteRegex,
          `<Remains volume_L="${newVol.toFixed(2)}">Digestive Waste</Remains>`,
        )
      } else {
        bowContent += `\n      <Remains volume_L="${accumulatedWasteVol.toFixed(2)}">Digestive Waste</Remains>`
      }
    }

    stomContent = stomContent.replace(/^\s*\n/gm, '').trim()
    bowContent = bowContent.replace(/^\s*\n/gm, '').trim()

    updatedXml = updatedXml.replace(
      /<Stomach([^>]*)>[\s\S]*?<\/Stomach>/i,
      (match, attrs) => {
        return `<Stomach${attrs}>\n${stomContent}\n    </Stomach>`
      },
    )

    updatedXml = updatedXml.replace(
      /<Bowels([^>]*)>[\s\S]*?<\/Bowels>/i,
      (match, attrs) => {
        return `<Bowels${attrs}>\n${bowContent}\n    </Bowels>`
      },
    )

    } // end digestionEngine

    if (engineToggles.struggleEngine) {
      const struggleResult = processStruggle(updatedXml, oldXml, elapsed, modifiers.StomachResistance || 0, modifiers.EnergyDrain || 0)
      updatedXml = struggleResult.xml
      if (struggleResult.struggleEvents.length > 0) {
        await (spindle as any).variables.chat.set(
          chatId,
          'pendingStruggleEvents',
          JSON.stringify(struggleResult.struggleEvents),
        )
        spindle.log.info(
          `Struggle events: ${struggleResult.struggleEvents.length} events triggered`,
        )
      }
    } // end struggleEngine

    if (engineToggles.arousalClimax) {
      // Vitals: Arousal, Climax, & Penis Scaling
      const oldArousal = getStat(oldXml, 'Arousal') || 0
      let newArousal = getStat(updatedXml, 'Arousal') || 0

      // Apply hourly decay to the old value (modifiers can modify decay rate)
      const arousalDecayRate = 50 * (1 + (modifiers.ArousalDecay || 0))
      const decayedArousal = Math.max(0, oldArousal - arousalDecayRate * elapsed)

      // If the LLM didn't add enough points to overcome the decay, it drops.
      // If the LLM added more points than the decay, it rises.
      let finalArousal = Math.max(newArousal * (1 + (modifiers.ArousalGain || 0)), decayedArousal)
      finalArousal = Math.min(100, finalArousal)

      let finalClimax = getStat(oldXml, 'Climax') || 0

      // Check if this is the turn AFTER an orgasm (needs reset)
      const pendingOrgasmReset = await (spindle as any).variables.chat.get(chatId, 'pendingOrgasmReset')
      if (pendingOrgasmReset === 'true') {
        finalArousal = 0
        finalClimax = 0
        await (spindle as any).variables.chat.delete(chatId, 'pendingOrgasmReset')
        spindle.log.info('Post-orgasm reset applied.')
      } else {
        // Turn-based climax meter
        if (finalArousal >= 95) {
          finalClimax = Math.min(100, finalClimax + 25)
        } else {
          finalClimax = Math.max(0, finalClimax - 25)
        }

        // Trigger orgasm!
        if (finalClimax >= 100) {
          finalClimax = 100
          await (spindle as any).variables.chat.set(chatId, 'pendingOrgasmReset', 'true')
          maybeToast('climaxEvents', 'success', '🔥 Climax reached! Resetting next turn.')
          spindle.log.info('Climax event triggered.')
        }
      }

      updatedXml = setStat(updatedXml, 'Arousal', finalArousal)
      updatedXml = setStat(updatedXml, 'Climax', finalClimax)

      // Calculate current penis size based on arousal (30% to 100% scaling)
      const maxPenisL = getStat(updatedXml, 'PenisLength_cm') || 0
      const maxPenisG = getStat(updatedXml, 'PenisGirth_cm') || 0
      if (maxPenisL > 0) {
        const curL = maxPenisL * (0.3 + 0.7 * (finalArousal / 100))
        updatedXml = setStat(updatedXml, 'CurrentPenisLength_cm', curL)
      }
      if (maxPenisG > 0) {
        const curG = maxPenisG * (0.3 + 0.7 * (finalArousal / 100))
        updatedXml = setStat(updatedXml, 'CurrentPenisGirth_cm', curG)
      }
    } // end arousalClimax

    if (engineToggles.nutrientAbsorption && totalDigestedVol > 0) {
      const nutrientMult = 1 + (modifiers.NutrientAbsorption || 0)
      const heightGrowth = totalDigestedVol * 0.035 * nutrientMult
      const weightGrowth = totalDigestedVol * 0.035 * nutrientMult
      const breastGrowth = totalDigestedVol * 1.0 * nutrientMult
      const hipsGrowth = totalDigestedVol * 0.035 * nutrientMult
      const penisLGrowth = totalDigestedVol * 0.014 * nutrientMult
      const penisGGrowth = totalDigestedVol * 0.004 * nutrientMult

      // Read body stats from the OLD (stored) sheet as the authoritative base,
      // then clamp the LLM's values so it can never shrink the character.
      const oldHeight = getStat(oldXml, 'Height_cm') || 160
      const oldWeight = getStat(oldXml, 'Weight_kg') || 60
      const oldBreastVol = getStat(oldXml, 'BreastVolume_ml') || 0
      const oldHips = getStat(oldXml, 'Hips_cm') || 90
      const oldPenisL = getStat(oldXml, 'PenisLength_cm') || 0
      const oldPenisG = getStat(oldXml, 'PenisGirth_cm') || 0

      let height = Math.max(getStat(updatedXml, 'Height_cm') || oldHeight, oldHeight)
      let weight = Math.max(getStat(updatedXml, 'Weight_kg') || oldWeight, oldWeight)
      let breastVol = Math.max(getStat(updatedXml, 'BreastVolume_ml') || oldBreastVol, oldBreastVol)
      let hips = Math.max(getStat(updatedXml, 'Hips_cm') || oldHips, oldHips)
      let penisL = Math.max(getStat(updatedXml, 'PenisLength_cm') || oldPenisL, oldPenisL)
      let penisG = Math.max(getStat(updatedXml, 'PenisGirth_cm') || oldPenisG, oldPenisG)

      height += heightGrowth
      weight += weightGrowth
      breastVol += breastGrowth
      hips += hipsGrowth
      penisL += penisLGrowth
      penisG += penisGGrowth

      updatedXml = setStat(updatedXml, 'Height_cm', height)
      updatedXml = setStat(updatedXml, 'Weight_kg', weight)
      updatedXml = setStat(updatedXml, 'BreastVolume_ml', breastVol)
      updatedXml = setStat(updatedXml, 'Hips_cm', hips)
      updatedXml = setStat(updatedXml, 'PenisLength_cm', penisL)
      updatedXml = setStat(updatedXml, 'PenisGirth_cm', penisG)

      maybeToast(
        'nutrientAbsorption',
        'info',
        `Nutrient absorption: +${heightGrowth.toFixed(2)}cm height, +${weightGrowth.toFixed(2)}kg weight, +${breastGrowth.toFixed(2)}ml breasts`,
      )
      spindle.log.info(
        `Nutrient absorption: +${heightGrowth.toFixed(2)}cm height, ` +
          `+${weightGrowth.toFixed(2)}kg weight, ` +
          `+${breastGrowth.toFixed(2)}ml breasts, ` +
          `+${hipsGrowth.toFixed(2)}cm hips, ` +
          `+${penisLGrowth.toFixed(2)}cm penis L, ` +
          `+${penisGGrowth.toFixed(2)}cm penis G`,
      )
    } // end nutrientAbsorption

    if (engineToggles.clothingStress) {
      const clothingResult = processClothingStress(updatedXml, oldXml, modifiers.ClothingStress || 0)
      updatedXml = clothingResult.xml

      if (clothingResult.damageEvents.length > 0) {
        maybeToast('clothingDamage', 'warning', `Clothing damage: ${clothingResult.damageEvents.join(', ')}`)
        spindle.log.info(`Clothing damage: ${clothingResult.damageEvents.join(', ')}`)
      }
    } // end clothingStress

    spindle.log.info(
      `Digestion tick: ${elapsed.toFixed(2)}h elapsed, ` +
        `acid ${acidLevel.toFixed(1)}%, ${totalItemCount} items processed, ` +
        `${wasteCount} moved to bowels, ${totalDigestedVol.toFixed(2)}L digested`,
    )

    return updatedXml
  } catch (e) {
    spindle.log.error(`Digestion tick failed: ${e}`)
    return newXml
  }
}

async function commitUpdate(
  chatId: string,
  messageId: string,
  sheetXml: string,
  chatIndex: number,
) {
  const oldSheet = sheets.get(chatId) || ''
  const finalXml = await runDigestionTick(sheetXml, oldSheet, chatId)

  await saveChatSheet(chatId, finalXml)
  const list = snapshots.get(chatId) || []
  list.push({ messageId, sheetXml: finalXml, chatIndex })
  snapshots.set(chatId, list)
  await saveChatSnapshots(chatId)

  if (chatId === activeChatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: finalXml })
  }
  spindle.log.info(`Sheet committed for message ${messageId} in chat ${chatId}`)
}

async function rollbackOnDelete(chatId: string, messageId: string) {
  const list = snapshots.get(chatId)
  if (!list) {
    maybeToast('rollbackWarnings', 'warning', 'Rollback: no snapshot list found')
    return
  }

  const hadSnapshot = list.some((s) => s.messageId === messageId)
  const newList = list.filter((s) => s.messageId !== messageId)
  snapshots.set(chatId, newList)
  committedMessageIds.delete(messageId)

  if (!hadSnapshot) {
    maybeToast('rollbackWarnings', 'warning', 'Rollback: deleted message had no snapshot')
    return
  }

  maybeToast('rollbackEvents', 'info', 'Rollback: restoring previous sheet state...')

  if (newList.length > 0) {
    const latest = newList.reduce((a, b) => (a.chatIndex > b.chatIndex ? a : b))
    await saveChatSheet(chatId, latest.sheetXml)
    if (chatId === activeChatId) {
      spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: latest.sheetXml })
    }
    maybeToast('rollbackEvents', 'success', 'Rollback: restored previous sheet')
  } else {
    await saveChatSheet(chatId, '')
    if (chatId === activeChatId) {
      spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: '' })
    }
    maybeToast('rollbackEvents', 'success', 'Rollback: cleared sheet')
  }

  await saveChatSnapshots(chatId)
  spindle.log.info(`Rolled back in chat ${chatId} after deletion of ${messageId}`)
}

function buildSheetPrompt(sheetXml: string): string {
  return `[CHARACTER SHEET SYSTEM

You are operating with a persistent character sheet tracker. Below is the current state of the character sheet. You must stay aware of these values and act consistently with them.

<CurrentCharacterSheet>
${sheetXml}
</CurrentCharacterSheet>

─── YOUR RESPONSIBILITIES (what YOU must do) ───
1. ADVANCE <Time> FORWARD every turn. If the scene progresses, increase the <Time> value. The extension uses the time delta to calculate digestion, arousal decay, and body growth. If you do not advance time, the simulation stalls.
2. Write a complete <sheet_update> block at the END of every response (see rules below). Previous sheet_update blocks have been removed from your chat history — you MUST still write a new one each turn.
3. Add <Item> entries to <Stomach> or <Bowels> when the character eats or is eaten. Remove them only if the item was regurgitated or otherwise exits the body.
4. Update <Arousal> based on what happens in the scene (intimacy raises it, time passes lowers it — the extension halves it each hour).
5. Update <Description> tags for prey each turn to reflect their current state (squirming, dissolving, going limp).
6. Fill in any blank State/World fields (Time, Weather, Temperature, etc.) with sensible defaults.

─── WHAT THE EXTENSION HANDLES AUTOMATICALLY (do NOT do these yourself) ───
- Digestion percentages: calculated from <Time> delta automatically.
- Nutrient absorption and body growth (Height, Weight, Breast, Hips, Penis): applied automatically when items digest.
- Clothing stress and condition: degraded automatically as the body grows.
- <Climax> meter: managed entirely by the extension based on <Arousal>.
- <CurrentPenisLength_cm> and <CurrentPenisGirth_cm>: calculated from <Arousal> automatically.
- Moving fully-digested prey remains to <Bowels>.

─── UPDATE INSTRUCTIONS ───

You MUST include an updated copy of the FULL sheet inside a <sheet_update> block at the very END of EVERY response — even if nothing changed. Always advance <Time> forward as the scene progresses.

CRITICAL XML RULES:
1. You MUST copy the EXACT XML structure provided in <CurrentCharacterSheet>. Do NOT invent new tags, do NOT change tag names, do NOT change attributes.
2. Clothing MUST be inside <Clothing> using the <Equip slot="..." elasticity="...">...</Equip> format.
   VALID SLOT NAMES ONLY: "Head Top", "Face", "Head Lower", "Neck", "Underwear Top", "Underwear Bottom", "Torso Base", "Torso Mid", "Torso Outer", "Torso Shell", "Hands Base", "Hands Outer", "Legs Base", "Legs Outer", "Feet Base", "Feet Outer", "Jewelry", "Back", "Waist".
3. The <Equip> tag MUST ALWAYS have an elasticity attribute. Valid values are "rigid", "standard", "stretchy", or "magic". Never omit it. If the extension has added stress="..." or condition="..." attributes to an Equip tag, copy them exactly as-is. Do NOT modify or remove them.
4. Stomach and Bowel contents MUST use the <Item type="Liquid|Food|Prey" name="..." volume_L="..." digestion="...%"> format. Do not use a <Prey> tag. Items can be inside <Stomach> or <Bowels> (for full-tour scenarios).
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
6. DO NOT calculate digestion percentages yourself. The extension's Metabolic Engine handles all digestion math automatically based on the <Time> you set. You only need to add items to the stomach or bowels when eaten, and update the <Time> tag.
7. If prey is fully digested (reaches 100%), the extension will AUTOMATICALLY move their remains to the Bowels section. You do NOT need to move the remains yourself. Just let the item disappear from <Stomach> in your next update if it was fully digested, and the extension will handle the transfer to <Bowels>.
8. The extension AUTOMATICALLY handles nutrient absorption and body growth. When items are digested, the character's Height, Weight, BreastVolume, Hips, and Penis dimensions will increase proportionally. Do NOT manually adjust these stats based on digestion — the extension does it for you. Only adjust them if something else changes them (e.g. magic, transformation).
9. The extension AUTOMATICALLY handles clothing stress and condition in "hardcore" mode. Clothes degrade as the body grows: intact → snug → strained → tight → damaged → ruined. Once "damaged" or "ruined", the condition is permanent. In "flavor" mode, clothes never degrade. You can narrate clothing straining or tearing based on the condition values you see in the sheet, but do NOT change the stress or condition attributes yourself.
10. ABSOLUTE SOURCE OF TRUTH: The <CurrentCharacterSheet> provided above is the absolute source of truth. You MUST copy the values from it exactly, especially <ClothingMode>. If it says "hardcore", you MUST output "hardcore". Do NOT copy values from previous messages or your memory. Always look at the provided sheet first.
11. The <sheet_update> block is invisible to the user — do not mention it in your visible text.
12. If absolutely nothing on the sheet changed, you may omit the block.
13. Always include all sections (State, BaseStats, Clothing, Backpack, SkillsAndTraits, DigestiveTract) even if some are empty.
14. If any State or World field (Time, Weather, Temperature, Area, Building, Room, Health, Energy) is blank or "0" in the <CurrentCharacterSheet>, you MUST invent a sensible default consistent with the current scene. For example, if Weather is blank, set it based on the season or what's happening in the story. If Health or Energy is blank, default to 100. Never leave these fields empty in your <sheet_update>.
15. Prey <Description> MUST reflect the prey's current action/state and update EVERY turn. <Appearance> stays the same unless the prey transforms. Use <Description> for what's happening now (squirming, dissolving, going limp) and <Appearance> for what they look like (age, species, build, hair, eyes).
16. <Arousal> is a 0-100 meter. The extension AUTOMATICALLY decays it by 50% per hour. You MUST actively add points to it to keep it up during intimate scenes (e.g., add +30 if stimulated, +50 if highly stimulated). If no intimacy occurs, it will naturally drop.
17. <Climax> is a 0-100 meter managed ENTIRELY by the extension. NEVER change its value yourself. If <Arousal> stays at 95-100, it will rise. If <Arousal> drops below 95, it will fall.
18. <PenisLength_cm> and <PenisGirth_cm> are the MAX sizes. The extension automatically calculates and updates <CurrentPenisLength_cm> and <CurrentPenisGirth_cm> based on Arousal (0% arousal = 30% size, 100% arousal = 100% size). Do NOT output or modify the Current tags yourself.

─── STRUGGLE & INDIGESTION SYSTEM ───
The extension includes a Struggle Engine that simulates prey resistance and stomach indigestion. Here is how it works and what YOU must do:

PREY WILLINGNESS STATES:
Each prey item in <Stomach> has a willingness attribute: willingness="willing|reluctant|fighting".
- "willing": The prey is cooperating or enjoying it. Digestion is 25% FASTER. They do NOT contribute to indigestion. Use this for willing prey, consensual scenarios, or prey who have given up.
- "reluctant": The prey is passively resisting but not actively fighting. Normal digestion speed. They contribute a small amount to indigestion. This is the DEFAULT — use it when unsure.
- "fighting": The prey is actively struggling, kicking, thrashing. Digestion is 50% SLOWER. They contribute heavily to indigestion. Use this when prey is actively resisting.

YOU must set the willingness attribute based on the scene narrative. If a prey character is fighting back, set willingness="fighting". If they surrender or go limp, change it to "willing" or "reluctant". The extension handles all the math — you only set the state.

PREY STAMINA:
Each prey has a stamina attribute (0-100). The extension AUTOMATICALLY drains stamina when prey are "fighting" and recovers it when they are not. When stamina reaches 0, the extension forces the prey to "reluctant" (too exhausted to fight). You do NOT need to manage stamina yourself — just copy the value you see in the sheet.

STOMACH INDIGESTION METER:
The <Stomach> tag has an indigestion attribute (0-100). This is a stomach-level meter that rises when prey fight and falls when they don't. The extension AUTOMATICALLY calculates indigestion based on prey willingness, prey size relative to stomach capacity, prey consciousness (digestion %), and the pred's suppression efforts. You do NOT set indigestion yourself — just copy the value you see.

INDIGESTION THRESHOLD EVENTS:
When indigestion crosses certain thresholds (25%, 50%, 75%, 90%), the extension generates an event notification. You will see these in a "STRUGGLE EVENTS" section injected into your prompt. When you see them, NARRATE the effects:
- 25%: Mild discomfort, slight queasiness.
- 50%: Visible discomfort, stomach gurgling, the pred feels pressure.
- 75%: Gagging, struggling to keep prey down, visible distension.
- 90%: Severe retching, the pred is barely holding on.

VOMIT EVENTS:
When indigestion reaches 100%, a vomit event triggers. The extension rolls escape chances for each prey — those that escape are ALREADY REMOVED from the stored sheet. You will see a "STRUGGLE EVENTS" notification telling you which prey escaped and which remain. You MUST:
- Narrate the vomit scene dramatically.
- Remove escaped prey from the <Stomach> section in your <sheet_update> (the extension already removed them from the stored sheet, but your output sheet must match).
- Keep prey that did not escape in the <Stomach> section.
- After vomiting, indigestion resets to 0 and the pred loses Energy.

PRED SUPPRESSION:
The pred can actively suppress struggling prey. This is controlled by the suppressing="true|false" attribute on the <Stomach> tag. When suppressing="true":
- Indigestion accumulation is greatly reduced (the pred is actively holding prey down).
- BUT it drains the pred's Energy faster.
- It also causes stomach fatigue over time, which reduces suppression effectiveness.
Set suppressing="true" when the pred is actively clenching, holding, or pinning down prey. Set suppressing="false" when the pred is relaxed or distracted. The extension handles all suppression math.

STOMACH RESISTANCE:
<StomachResistance> in <BaseStats> is a multiplier (default 1.0) that affects how easily the pred's stomach endures struggling. Higher values = more resistant (less indigestion per struggle). Lower values = weaker stomach (more indigestion). This is a character trait — set it once and rarely change it (e.g., a pred with an "iron stomach" might have 2.0, a delicate pred might have 0.5).

ENERGY:
<Energy> in <State> is drained by fighting prey and active suppression. The extension AUTOMATICALLY manages Energy drain from the struggle system. You may also adjust Energy for other reasons (exertion, rest, etc.). When Energy is low, suppression becomes less effective and the pred may struggle to hold prey.

SUMMARY OF WHAT YOU DO vs WHAT THE EXTENSION DOES:
YOU do:
- Set willingness="willing|reluctant|fighting" on prey items based on scene.
- Set suppressing="true|false" on the <Stomach> tag based on scene.
- Set <StomachResistance> as a character trait.
- Narrate indigestion threshold events and vomit events when notified.
- Remove escaped prey from your <sheet_update> after a vomit event.
The EXTENSION does (do NOT do these):
- Calculates indigestion accumulation/decay.
- Drains/recovers prey stamina.
- Drains/recovers pred Energy from struggle.
- Rolls escape chances during vomit.
- Removes escaped prey from the stored sheet.
- Tracks stomach fatigue.
- Generates threshold and vomit event notifications.

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

spindle.onFrontendMessage(async (msg: any) => {
  if (msg.type === 'SETTINGS_UPDATED') {
    if (msg.toastSettings) toastSettings = { ...toastSettings, ...msg.toastSettings }
    if (msg.engineToggles) engineToggles = { ...engineToggles, ...msg.engineToggles }
    spindle.log.info('Settings updated from frontend')
    return
  }

  if (msg.type === 'SYNC_BIO_DATA' && msg.xmlData) {
    if (!activeChatId) {
      maybeToast('chatWarnings', 'warning', 'Open a chat first before syncing the sheet.')
      return
    }
    await saveChatSheet(activeChatId, msg.xmlData)
    await (spindle as any).variables.chat.set(activeChatId, 'manualSyncPending', 'true')
    spindle.log.info(`Sheet synced from frontend for chat ${activeChatId}`)
    maybeToast('sheetSync', 'success', 'Character sheet synced!')
  }

  if (msg.type === 'GET_LATEST_SHEET') {
    if (!activeChatId) {
      maybeToast('chatWarnings', 'warning', 'Open a chat first.')
      return
    }
    await (spindle as any).variables.chat.delete(activeChatId, 'manualSyncPending')

    // Always scan chat history first — the button is "Sync from Latest Message"
    let sheet = ''

    try {
      const messages = await spindle.chat.getMessages(activeChatId)
      for (let i = messages.length - 1; i >= 0; i--) {
        const msgItem = messages[i]
        if (msgItem.role !== 'assistant') continue
        const content = extractTextContent(msgItem.content)
        const update = extractSheetUpdate(content)
        if (update) {
          sheet = update
          await saveChatSheet(activeChatId, sheet)
          spindle.log.info(`GET_LATEST_SHEET: found sheet in message ${msgItem.id || i}`)
          break
        }
      }
    } catch (e) {
      spindle.log.error(`GET_LATEST_SHEET: failed to scan messages: ${e}`)
    }

    // Fall back to stored sheet if no <sheet_update> found in messages
    if (!sheet) {
      sheet = sheets.get(activeChatId) || ''
      if (sheet) {
        spindle.log.info('GET_LATEST_SHEET: no sheet_update in messages, using stored sheet')
      }
    }

    spindle.sendToFrontend({ type: 'LATEST_SHEET', xml: sheet })
  }

  if (msg.type === 'POPULATE_FIELDS' && msg.fields) {
    if (!activeChatId) {
      maybeToast('chatWarnings', 'warning', 'Open a chat first.')
      return
    }

    // Guard: reject if a populate is already in progress (prevents spam)
    const existingPopulate = await (spindle as any).variables.chat.get(
      activeChatId,
      'populatePending',
    )
    if (existingPopulate) {
      spindle.sendToFrontend({ type: 'POPULATE_DONE', success: false })
      return
    }

    const fields = msg.fields as string[]
    await (spindle as any).variables.chat.set(
      activeChatId,
      'populateFields',
      fields.join(', '),
    )
    // Track that a populate generation is pending so GENERATION_ENDED
    // can notify the frontend when it completes.
    await (spindle as any).variables.chat.set(
      activeChatId,
      'populatePending',
      'true',
    )

    try {
      // NOTE: The message is intentionally NOT hidden. setMessageHidden
      // removes the message from the LLM's context (soft-delete from
      // prompt), which would leave the LLM with no user input to
      // respond to. The LLM must see this request to act on it.
      //
      // The flagged field names are included directly in the user
      // message so the LLM knows exactly which fields to populate.
      const fieldList = fields.join(', ')
      await spindle.chat.appendMessage(
        activeChatId,
        {
          role: 'user',
          content: `[System: Auto-populate request. Please populate ONLY the following blank sheet fields with sensible, scene-appropriate defaults: ${fieldList}. Leave ALL other fields exactly as they are. Do not advance the story or add new narrative events.\n\nCRITICAL: You MUST output the updated sheet as FULL NESTED XML inside a <sheet_update> block — exactly the same XML structure shown in <CurrentCharacterSheet>. Do NOT use flat "Key: Value" lines. The output MUST look like:\n<sheet_update>\n<CharacterSheet>\n  <State>\n    <Time>...</Time>\n    ...\n  </State>\n  <BaseStats>\n    <Name>...</Name>\n    ...\n  </BaseStats>\n  ...all other sections...\n</CharacterSheet>\n</sheet_update>\nCopy every tag and attribute from <CurrentCharacterSheet> exactly, filling in only the blank fields listed above. Output the COMPLETE sheet with ALL sections (State, BaseStats, Clothing, Backpack, SkillsAndTraits, DigestiveTract).]`,
        },
        { triggerGeneration: true },
      )
    } catch (e) {
      maybeToast('errors', 'error', 'Populate failed: ' + e)
      await (spindle as any).variables.chat.delete(
        activeChatId,
        'populateFields',
      )
      await (spindle as any).variables.chat.delete(
        activeChatId,
        'populatePending',
      )
      spindle.sendToFrontend({ type: 'POPULATE_DONE', success: false })
    }
  }
})

spindle.registerInterceptor(async (messages, context) => {
  const ctx = context as any
  const chatId: string = ctx.chatId
  const genType: string = ctx.generationType

  pendingGenerationType = genType

  let sheet = sheets.get(chatId)
  if (sheet === undefined) {
    sheet = (await loadChatSheet(chatId)) || ''
  }

  if (!sheet) return messages

  const manualSyncPending = await (spindle as any).variables.chat.get(chatId, 'manualSyncPending')
  if (manualSyncPending === 'true') {
    await (spindle as any).variables.chat.delete(chatId, 'manualSyncPending')
    spindle.log.info(`Manual sync pending — skipping stale parse for chat ${chatId}`)
  } else if (genType === 'normal') {
    const lastAssistant = findLastAssistantMessage(messages)
    if (
      lastAssistant &&
      lastAssistant.sourceMessageId &&
      !committedMessageIds.has(lastAssistant.sourceMessageId)
    ) {
      const content = extractTextContent(lastAssistant.content)
      const update = extractSheetUpdate(content)
      if (update) {
        const chatIndex = lastAssistant.sourceIndexInChat ?? 0
        await commitUpdate(chatId, lastAssistant.sourceMessageId, update, chatIndex)
        committedMessageIds.add(lastAssistant.sourceMessageId)
        sheet = sheets.get(chatId) || sheet
      }
    }
  }

  let populateInstructions = ''
  const populateFields = await (spindle as any).variables.chat.get(
    chatId,
    'populateFields',
  )
  if (populateFields) {
    await (spindle as any).variables.chat.delete(chatId, 'populateFields')
    populateInstructions = `\n\n─── AUTO-POPULATE REQUEST ───\nThe user has requested that you populate ONLY the following blank fields with sensible, scene-appropriate defaults: ${populateFields}\nLeave ALL other fields exactly as they are.\nDo not advance the story or add new narrative events.\n\nCRITICAL FORMAT REMINDER: Your <sheet_update> block MUST contain FULL NESTED XML matching the structure of <CurrentCharacterSheet> — NOT flat "Key: Value" lines. The output MUST look like:\n<sheet_update>\n<CharacterSheet>\n  <State><Time>...</Time>...</State>\n  <BaseStats><Name>...</Name>...</BaseStats>\n  <Clothing>...</Clothing>\n  <Backpack>...</Backpack>\n  <SkillsAndTraits>...</SkillsAndTraits>\n  <DigestiveTract>...</DigestiveTract>\n</CharacterSheet>\n</sheet_update>\nCopy every tag and attribute from <CurrentCharacterSheet> exactly, filling in only the blank fields listed above. Output the COMPLETE sheet with ALL sections.`
  }

  let struggleNotification = ''
  const pendingStruggleEvents = await (spindle as any).variables.chat.get(
    chatId,
    'pendingStruggleEvents',
  )
  if (pendingStruggleEvents) {
    await (spindle as any).variables.chat.delete(chatId, 'pendingStruggleEvents')
    try {
      const events: string[] = JSON.parse(pendingStruggleEvents)
      if (events.length > 0) {
        struggleNotification =
          '\n\n─── STRUGGLE EVENTS ───\n' +
          events.join('\n') +
          '\n\nIMPORTANT: The events above were triggered by the Struggle Engine. You MUST narrate them in your response. If prey escaped during a vomit event, they have ALREADY been removed from the stored sheet — make sure your <sheet_update> does not include them in <Stomach>.'
      }
    } catch {
      // ignore parse errors
    }
  }

  const injection = {
    role: 'system' as const,
    content: buildSheetPrompt(sheet) + populateInstructions + struggleNotification,
  }

  // ─── Strip <sheet_update> blocks from chat history ──────────
  // The LLM must rely ONLY on the injected <CurrentCharacterSheet>.
  // Old <sheet_update> blocks in history cause it to copy stale values.
  // This modifies the in-memory copy only — database messages are preserved.
  const cleanedMessages = messages.map((msg: any) => {
    if (typeof msg.content === 'string') {
      return {
        ...msg,
        content: msg.content.replace(
          /<sheet_update>[\s\S]*?<\/sheet_update>/gi,
          '',
        ),
      }
    }
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((part: any) => {
          if (part.type === 'text' && typeof part.text === 'string') {
            return {
              ...part,
              text: part.text.replace(
                /<sheet_update>[\s\S]*?<\/sheet_update>/gi,
                '',
              ),
            }
          }
          return part
        }),
      }
    }
    return msg
  })

  return {
    messages: [injection, ...cleanedMessages],
    breakdown: [{ messageIndex: 0, name: 'Character Sheet' }],
  }
}, 50)

spindle.on('GENERATION_ENDED', async (payload: any) => {
  if (payload.error) return

  const { chatId, messageId, content } = payload
  if (!chatId || !messageId || !content) return
  if (chatId !== activeChatId) return
  if (pendingGenerationType === 'swipe' || pendingGenerationType === 'regenerate') {
    return
  }
  if (committedMessageIds.has(messageId)) return

  const update = extractSheetUpdate(content)

  // ─── Populate completion notification ──────────────────────
  // If a populate generation just finished, notify the frontend
  // so the button can reset (regardless of whether a sheet_update
  // was produced).
  const populatePending = await (spindle as any).variables.chat.get(
    chatId,
    'populatePending',
  )
  if (populatePending) {
    await (spindle as any).variables.chat.delete(chatId, 'populatePending')
    spindle.sendToFrontend({
      type: 'POPULATE_DONE',
      success: !!update,
    })
  }

  if (!update) return

  const list = snapshots.get(chatId) || []
  const chatIndex = list.length
  await commitUpdate(chatId, messageId, update, chatIndex)
  committedMessageIds.add(messageId)

  maybeToast('digestionTicks', 'success', 'Sheet updated - digestion tick applied')
})

spindle.on('CHAT_SWITCHED', async (payload: any) => {
  await switchToChat(payload.chatId)
})

spindle.on('MESSAGE_DELETED', async (payload: any) => {
  const { chatId, messageId } = payload
  if (chatId) await rollbackOnDelete(chatId, messageId)
})

spindle.log.info('Bio Tracker backend loaded (Digestion Engine v9)')
