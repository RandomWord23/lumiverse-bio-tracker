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
  MAX_HP_BASE,
  CON_HP_BONUS,
  HEALTH_REGEN,
  HEALTH_DAMAGE,
  HEALTH_STATE_MODIFIERS,
  HEALTH_STATE_THRESHOLDS,
  xpForLevel,
  MAX_LEVEL,
  ATTRIBUTE_BASE,
  ATTRIBUTE_MAX,
  attributePointCost,
  XP_AWARDS,
  QUEST_MIN_XP,
  QUEST_MAX_XP,
} from './types'
import type {
  DiceConfig,
  DiceSection,
  RolledDie,
  RolledSection,
  ActionRoll,
  AbsorptionResult,
  ConversionResult,
  HealthState,
  HealthDamageResult,
  ProgressionResult,
  Quest,
  QuestResult,
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

/** Convert a decimal-hour story-clock value (0-24 range) to a 24-hour
 *  "HH:MM" string for display in the character sheet. This avoids the
 *  ambiguity of decimal hours (e.g. 8.36 being misread as 8:36) that
 *  confuses the LLM. */
export function decimalToClock(decimal: number): string {
  const h = Math.floor(decimal) % 24
  const m = Math.round((decimal - Math.floor(decimal)) * 60)
  // Handle minute rounding overflow (e.g. 59.999 → 60)
  if (m >= 60) {
    return decimalToClock(decimal + 1 / 60)
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Parse a time value that may be in "HH:MM" clock format or legacy
 *  decimal-hour format, returning decimal hours (0-24 range). */
export function clockToDecimal(value: string): number {
  const trimmed = value.trim()
  const hmMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (hmMatch) {
    const h = parseInt(hmMatch[1], 10)
    const m = parseInt(hmMatch[2], 10)
    return h + m / 60
  }
  const h = parseFloat(trimmed)
  return isNaN(h) ? 0 : h
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

// ---------------------------------------------------------------------------
// repairDigestiveTract — fix unclosed sub-section tags inside <DigestiveTract>
//
// The LLM sometimes forgets to close <Bowels> (or <Womb>, <Balls>) before
// opening the next sibling or </DigestiveTract>, producing malformed XML like:
//
//   <Bowels current="0.00 L">
//   <Womb current="0.00 L">
//   </Womb>
//   ...
//   </DigestiveTract>          ← parsererror: DigestiveTract != Bowels
//
// The downstream regex extraction (/<Bowels[^>]*>([\s\S]*?)<\/Bowels>/i)
// and replacement both require a closing tag to match.  Without repair the
// malformed XML passes through unchanged and the frontend DOMParser hits a
// parsererror, silently preventing ALL fields (including Backpack) from
// populating.
//
// Strategy: tokenize all opening/closing tags of the known sub-sections
// (Stomach, Bowels, Womb, Balls) within <DigestiveTract>.  Walk them with a
// stack.  When a new sub-section opens while another is still unclosed on
// the stack, insert the missing closing tag(s) just before the new opening
// tag.  Any tags still open at the end get closed before </DigestiveTract>.
// ---------------------------------------------------------------------------
export function repairDigestiveTract(xml: string): string {
  const dtMatch = xml.match(/<DigestiveTract([^>]*)>([\s\S]*?)<\/DigestiveTract>/i)
  if (!dtMatch) return xml

  const dtAttrs = dtMatch[1]
  const dtInner = dtMatch[2]
  const knownTags = ['Stomach', 'Bowels', 'Womb', 'Balls']

  // Tokenize: find all opening and closing tags of known sub-sections
  const tokenRegex = new RegExp(
    `<(\\/?)(${knownTags.join('|')})(?![a-zA-Z])([^>]*?)(\\/?)>`,
    'gi',
  )

  interface Token { type: 'open' | 'close'; tag: string; index: number }
  const tokens: Token[] = []
  let m: RegExpExecArray | null
  while ((m = tokenRegex.exec(dtInner)) !== null) {
    if (m[4] === '/') continue // skip self-closing tags
    tokens.push({
      type: m[1] === '/' ? 'close' : 'open',
      tag: m[2],
      index: m.index,
    })
  }

  // Walk tokens with a stack.  When a new sub-section opens while another is
  // still unclosed on the stack, insert the missing closing tag(s) just
  // before the new opening tag.  Any tags still open at the end get closed
  // before </DigestiveTract>.
  const stack: string[] = []
  const insertions: { pos: number; tag: string }[] = []

  for (const token of tokens) {
    if (token.type === 'open') {
      // Close any unclosed sub-sections before this new one opens
      while (stack.length > 0) {
        const unclosed = stack.pop()!
        insertions.push({ pos: token.index, tag: unclosed })
      }
      stack.push(token.tag)
    } else {
      // Close token: pop if it matches top of stack, otherwise ignore
      if (stack.length > 0 && stack[stack.length - 1] === token.tag) {
        stack.pop()
      }
    }
  }

  // Close any remaining unclosed tags at end of DigestiveTract inner
  while (stack.length > 0) {
    const unclosed = stack.pop()!
    insertions.push({ pos: dtInner.length, tag: unclosed })
  }

  if (insertions.length === 0) return xml

  // Apply insertions from rightmost to leftmost so positions stay valid
  insertions.sort((a, b) => b.pos - a.pos)
  let repaired = dtInner
  for (const ins of insertions) {
    repaired = repaired.slice(0, ins.pos) + `</${ins.tag}>\n    ` + repaired.slice(ins.pos)
  }

  return xml.replace(
    /<DigestiveTract[^>]*>[\s\S]*?<\/DigestiveTract>/i,
    `<DigestiveTract${dtAttrs}>${repaired}</DigestiveTract>`,
  )
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

  // 3. Health state modifiers
  if (engineToggles.healthSystem) {
    const state = getHealthState(xml)
    if (state !== 'Healthy' && state !== 'Incapacitated') {
      const stateMods = HEALTH_STATE_MODIFIERS[state]
      if (stateMods) {
        for (const [key, val] of Object.entries(stateMods)) {
          modifiers[key] = (modifiers[key] || 0) + val
        }
      }
    }
  }

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

// ─── Progression System (XP, Leveling, Attribute Points) ───
// Engine-managed meta-layer. The <Progression> block is injected by the
// engine after LLM generation — the LLM must NOT create or modify it.

/** Read the <Progression> block from sheet XML. Returns level, xp, attribute points. */
export function getProgression(xml: string): { level: number; xpCurrent: number; xpNext: number; attributePoints: number } {
  const match = xml.match(/<Progression>([\s\S]*?)<\/Progression>/i)
  if (!match) {
    return { level: 1, xpCurrent: 0, xpNext: xpForLevel(1), attributePoints: 0 }
  }
  const block = match[1]
  const levelMatch = block.match(/<Level\s+value="(\d+)"/i)
  const xpMatch = block.match(/<XP\s+current="([\d.]+)"\s+next="([\d.]+)"/i)
  const apMatch = block.match(/<AttributePoints\s+available="(\d+)"/i)
  const level = levelMatch ? parseInt(levelMatch[1]) || 1 : 1
  const xpCurrent = xpMatch ? parseFloat(xpMatch[1]) || 0 : 0
  const xpNext = xpMatch ? parseFloat(xpMatch[2]) || xpForLevel(level) : xpForLevel(level)
  const attributePoints = apMatch ? parseInt(apMatch[1]) || 0 : 0
  return { level, xpCurrent, xpNext, attributePoints }
}

/** Write (create or replace) the <Progression> block in sheet XML. */
export function setProgression(xml: string, level: number, xpCurrent: number, xpNext: number, attributePoints: number): string {
  const block = `<Progression>\n    <Level value="${level}" />\n    <XP current="${xpCurrent.toFixed(0)}" next="${xpNext.toFixed(0)}" />\n    <AttributePoints available="${attributePoints}" />\n  </Progression>`
  if (/<Progression>[\s\S]*?<\/Progression>/i.test(xml)) {
    return xml.replace(/<Progression>[\s\S]*?<\/Progression>/i, block)
  }
  if (/<\/CharacterSheet>/i.test(xml)) {
    return xml.replace(/<\/CharacterSheet>/i, `  ${block}\n</CharacterSheet>`)
  }
  return xml + '\n' + block
}

/**
 * Parse and strip <xp_award> tags from the sheet_update XML.
 * The LLM may include <xp_award amount="X" reason="..." /> tags to award
 * bonus XP for narrative milestones. Returns cleaned XML and total XP.
 */
export function processXpAwards(xml: string): { xml: string; totalXp: number; awards: { amount: number; reason: string }[] } {
  const awards: { amount: number; reason: string }[] = []
  const awardRegex = /<xp_award\s+amount="([\d.]+)"\s+reason="([^"]*)"\s*\/>/gi
  let match: RegExpExecArray | null
  while ((match = awardRegex.exec(xml)) !== null) {
    const amount = parseFloat(match[1]) || 0
    const reason = match[2] || ''
    if (amount > 0) {
      awards.push({ amount, reason })
    }
  }
  const totalXp = awards.reduce((sum, a) => sum + a.amount, 0)
  const cleanedXml = xml.replace(/<xp_award\s+[^>]*\/>/gi, '')
  return { xml: cleanedXml, totalXp, awards }
}

/**
 * Run the full progression cycle: add XP, check for level-ups,
 * grant attribute points, and inject/update the <Progression> block.
 */
export function processProgression(xml: string, engineXp: number): ProgressionResult {
  const events: string[] = []
  const { level: curLevel, xpCurrent, attributePoints } = getProgression(xml)

  let level = curLevel
  let totalGained = engineXp
  if (engineXp > 0) {
    events.push(`+${engineXp} XP (engine: digestion events)`)
  }

  let newXp = xpCurrent + totalGained
  let levelsGained = 0
  let newAttributePoints = attributePoints

  while (level < MAX_LEVEL && newXp >= xpForLevel(level)) {
    newXp -= xpForLevel(level)
    level++
    levelsGained++
    newAttributePoints += 2
    events.push(`LEVEL UP! Reached level ${level}. +2 attribute points.`)
  }

  const xpNext = xpForLevel(level)
  const displayXp = Math.min(newXp, xpNext)

  xml = setProgression(xml, level, displayXp, xpNext, newAttributePoints)

  if (totalGained > 0 || levelsGained > 0) {
    maybeToast('progressionEvents', 'success',
      levelsGained > 0
        ? `Level up! Now level ${level}. +${levelsGained * 2} attribute points available.`
        : `+${totalGained} XP gained.`
    )
  }

  return {
    xml, level, xpCurrent: displayXp, xpNext, attributePoints: newAttributePoints,
    xpGained: totalGained, leveledUp: levelsGained > 0, levelsGained, events,
  }
}

// ---------------------------------------------------------------------------
// Quest & Objective Tracker system
// ---------------------------------------------------------------------------

/** Read all quests from the engine-managed <Quests> block. Returns an empty
 *  array if the block is absent. */
export function getQuests(xml: string): Quest[] {
  const quests: Quest[] = []
  const blockMatch = xml.match(/<Quests>([\s\S]*?)<\/Quests>/i)
  if (!blockMatch) return quests
  const block = blockMatch[1]
  const questRegex = /<Quest\s+([^>]*?)\/>/gi
  let match: RegExpExecArray | null
  while ((match = questRegex.exec(block)) !== null) {
    const attrs = match[1]
    const id = getAttrFromString(attrs, 'id')
    const name = getAttrFromString(attrs, 'name')
    const description = getAttrFromString(attrs, 'description')
    const status = (getAttrFromString(attrs, 'status') || 'active') as Quest['status']
    const rewardXP = parseInt(getAttrFromString(attrs, 'rewardXP') || '0') || 0
    const rewardItems = getAttrFromString(attrs, 'rewardItems') || ''
    if (id && name) {
      quests.push({ id, name, description, status, rewardXP, rewardItems })
    }
  }
  return quests
}

/** Serialize a quest array into the <Quests> block and inject/replace it in the XML. */
export function setQuests(xml: string, quests: Quest[]): string {
  const lines = quests.map(q => {
    const desc = q.description.replace(/"/g, '"')
    const items = q.rewardItems.replace(/"/g, '"')
    return `    <Quest id="${q.id}" name="${q.name}" description="${desc}" status="${q.status}" rewardXP="${q.rewardXP}" rewardItems="${items}" />`
  })
  const block = `<Quests>\n${lines.join('\n')}\n  </Quests>`
  if (/<Quests>[\s\S]*?<\/Quests>/i.test(xml)) {
    return xml.replace(/<Quests>[\s\S]*?<\/Quests>/i, block)
  }
  if (/<\/CharacterSheet>/i.test(xml)) {
    return xml.replace(/<\/CharacterSheet>/i, `  ${block}\n</CharacterSheet>`)
  }
  return xml + '\n' + block
}

/** Parse LLM-created <quest_create>, <quest_complete>, and <quest_abandon>
 *  tags from the XML, apply them to the quest list, strip the tags, and
 *  return the updated XML plus any XP from completed quests. */
export function processQuestTags(xml: string): { xml: string; questXp: number; events: string[] } {
  const events: string[] = []
  let quests = getQuests(xml)
  let questXp = 0

  // Determine next auto-incremented quest ID
  let maxId = 0
  for (const q of quests) {
    const num = parseInt(q.id.replace(/^q/, '')) || 0
    if (num > maxId) maxId = num
  }

  // ── Parse <quest_create> tags ──
  const createRegex = /<quest_create\s+([^>]*?)\/>/gi
  let match: RegExpExecArray | null
  while ((match = createRegex.exec(xml)) !== null) {
    const attrs = match[1]
    const name = getAttrFromString(attrs, 'name')
    const description = getAttrFromString(attrs, 'description') || ''
    let rewardXP = parseInt(getAttrFromString(attrs, 'rewardXP') || '50') || 50
    rewardXP = Math.max(QUEST_MIN_XP, Math.min(QUEST_MAX_XP, rewardXP))
    const rewardItems = getAttrFromString(attrs, 'rewardItems') || ''
    if (!name) continue
    maxId++
    const id = `q${maxId}`
    quests.push({ id, name, description, status: 'active', rewardXP, rewardItems })
    events.push(`Quest created: ${name} (${id})`)
    maybeToast('questEvents', 'info', `📜 New quest: ${name}`)
  }

  // ── Parse <quest_complete> tags ──
  const completeRegex = /<quest_complete\s+([^>]*?)\/>/gi
  while ((match = completeRegex.exec(xml)) !== null) {
    const attrs = match[1]
    const id = getAttrFromString(attrs, 'id')
    if (!id) continue
    const quest = quests.find(q => q.id === id)
    if (!quest) {
      events.push(`Quest complete: unknown quest ${id}`)
      continue
    }
    if (quest.status === 'completed') continue
    quest.status = 'completed'
    questXp += quest.rewardXP
    events.push(`Quest completed: ${quest.name} (${id}) +${quest.rewardXP} XP`)
    maybeToast('questEvents', 'success', `✅ Quest complete: ${quest.name} (+${quest.rewardXP} XP)`)
  }

  // ── Parse <quest_abandon> tags ──
  const abandonRegex = /<quest_abandon\s+([^>]*?)\/>/gi
  while ((match = abandonRegex.exec(xml)) !== null) {
    const attrs = match[1]
    const id = getAttrFromString(attrs, 'id')
    if (!id) continue
    const quest = quests.find(q => q.id === id)
    if (!quest) {
      events.push(`Quest abandon: unknown quest ${id}`)
      continue
    }
    if (quest.status === 'abandoned') continue
    quest.status = 'abandoned'
    events.push(`Quest abandoned: ${quest.name} (${id})`)
    maybeToast('questEvents', 'warning', `🗑️ Quest abandoned: ${quest.name}`)
  }

  // ── Strip all quest tags from the XML ──
  let cleanedXml = xml
    .replace(/<quest_create\s+[^>]*?\/>/gi, '')
    .replace(/<quest_complete\s+[^>]*?\/>/gi, '')
    .replace(/<quest_abandon\s+[^>]*?\/>/gi, '')

  // ── Re-inject the updated <Quests> block ──
  if (quests.length > 0 || /<Quests>/i.test(cleanedXml)) {
    cleanedXml = setQuests(cleanedXml, quests)
  }

  return { xml: cleanedXml, questXp, events }
}

/** Full quest cycle: parse LLM tags, update quest state, and return XP
 *  from completed quests so the caller can feed it into processProgression. */
export function processQuests(xml: string): QuestResult {
  const tagResult = processQuestTags(xml)
  return {
    xml: tagResult.xml,
    questXp: tagResult.questXp,
    events: tagResult.events,
  }
}

/** Set a single attribute score in the <Attributes> XML block. Creates the block if missing. */
export function setAttribute(xml: string, key: string, value: number): string {
  if (/<Attributes>[\s\S]*?<\/Attributes>/i.test(xml)) {
    const attrRegex = new RegExp(`<${key}>.*?<\\/${key}>`, 'i')
    if (attrRegex.test(xml)) {
      return xml.replace(attrRegex, `<${key}>${value}</${key}>`)
    }
    return xml.replace(/<\/Attributes>/i, `    <${key}>${value}</${key}>\n  </Attributes>`)
  }
  const attrsBlock = `  <Attributes>\n    <${key}>${value}</${key}>\n  </Attributes>`
  if (/<\/BaseStats>/i.test(xml)) {
    return xml.replace(/<\/BaseStats>/i, `${attrsBlock}\n  </BaseStats>`)
  }
  if (/<\/CharacterSheet>/i.test(xml)) {
    return xml.replace(/<\/CharacterSheet>/i, `${attrsBlock}\n</CharacterSheet>`)
  }
  return xml + '\n' + attrsBlock
}

/**
 * Spend attribute points to raise a single attribute by 1.
 * Called from the frontend RPC handler.
 */
export function spendAttributePoint(xml: string, attrKey: string): { xml: string; success: boolean; message: string } {
  const { attributePoints } = getProgression(xml)
  const currentScore = getAttribute(xml, attrKey)

  if (!ATTRIBUTE_KEYS.includes(attrKey as typeof ATTRIBUTE_KEYS[number])) {
    return { xml, success: false, message: `Invalid attribute: ${attrKey}` }
  }
  if (attributePoints <= 0) {
    return { xml, success: false, message: 'No attribute points available.' }
  }
  if (currentScore >= ATTRIBUTE_MAX) {
    return { xml, success: false, message: `${attrKey} is already at maximum (${ATTRIBUTE_MAX}).` }
  }

  const cost = attributePointCost(currentScore)
  if (attributePoints < cost) {
    return { xml, success: false, message: `Need ${cost} points to raise ${attrKey} from ${currentScore} to ${currentScore + 1}, but only have ${attributePoints}.` }
  }

  const newScore = currentScore + 1
  xml = setAttribute(xml, attrKey, newScore)

  const remainingPoints = attributePoints - cost
  const { level, xpCurrent, xpNext } = getProgression(xml)
  xml = setProgression(xml, level, xpCurrent, xpNext, remainingPoints)

  return {
    xml, success: true,
    message: `Raised ${attrKey} from ${currentScore} to ${newScore}. Spent ${cost} attribute point(s). ${remainingPoints} remaining.`,
  }
}

// ─── Health & Damage System ────────────────────────────────
// Health pool (0–maxHP) with event-based damage and digestion-driven regen.
// Two-phase architecture:
//   Phase 1 (processHealthRegen): runs BEFORE existing engines, applies
//     digestion-driven regen so the modifier pool includes health state
//     penalties for the current tick.
//   Phase 2 (processHealthDamage): runs AFTER existing engines, reads their
//     results (vomit, indigestion thresholds, prey escapes, acid, overcapacity)
//     and applies discrete HP reductions.

/** Read the <Vitals><Health current="N" max="M" /></Vitals> block. Returns { current, max }. */
export function getHealth(xml: string): { current: number; max: number } {
  const match = xml.match(/<Vitals>[\s\S]*?<Health\s+current="([\d.]+)"\s+max="([\d.]+)"\s*\/>/i)
  if (match) {
    return { current: parseFloat(match[1]) || 0, max: parseFloat(match[2]) || MAX_HP_BASE }
  }
  // Fallback: legacy <Health>N</Health> format
  const legacy = getStat(xml, 'Health')
  return { current: legacy > 0 ? legacy : MAX_HP_BASE, max: MAX_HP_BASE }
}

/** Compute max HP from CON modifier: 100 + (CON_mod × 10). */
export function computeMaxHP(xml: string): number {
  const conScore = getAttribute(xml, 'CON')
  const conMod = attributeModifier(conScore)
  return MAX_HP_BASE + (conMod * CON_HP_BONUS)
}

/** Write the <Vitals><Health … /></Vitals> block into XML. Creates or replaces it. */
export function setHealth(xml: string, current: number, max: number): string {
  const clamped = Math.max(0, Math.min(max, current))
  const vitalsBlock = `<Vitals>\n    <Health current="${clamped.toFixed(0)}" max="${max.toFixed(0)}" />\n  </Vitals>`
  // Replace existing <Vitals>…</Vitals> block
  if (/<Vitals>[\s\S]*?<\/Vitals>/i.test(xml)) {
    return xml.replace(/<Vitals>[\s\S]*?<\/Vitals>/i, vitalsBlock)
  }
  // Insert before </CharacterSheet> if no <Vitals> exists
  if (/<\/CharacterSheet>/i.test(xml)) {
    return xml.replace(/<\/CharacterSheet>/i, `  ${vitalsBlock}\n</CharacterSheet>`)
  }
  // Fallback: append
  return xml + vitalsBlock
}

/** Determine the health state from current HP percentage. */
export function getHealthState(xml: string): HealthState {
  const { current, max } = getHealth(xml)
  if (current <= 0) return 'Incapacitated'
  const pct = current / max
  if (pct >= HEALTH_STATE_THRESHOLDS.HEALTHY) return 'Healthy'
  if (pct >= HEALTH_STATE_THRESHOLDS.BRUISED) return 'Bruised'
  if (pct >= HEALTH_STATE_THRESHOLDS.WOUNDED) return 'Wounded'
  if (pct >= HEALTH_STATE_THRESHOLDS.CRITICAL) return 'Critical'
  return 'Incapacitated'
}

/** Check if <BaseStats> has resting="true". */
function isResting(xml: string): boolean {
  const match = xml.match(/<BaseStats\s+([^>]*?)>/i)
  if (!match) return false
  const restingVal = getAttrFromString(match[1], 'resting')
  return restingVal === 'true'
}

/**
 * Phase 1: Apply digestion-driven health regeneration.
 * Mutates the XML to update <Vitals><Health … /></Vitals>.
 * Returns the updated XML.
 *
 * Regen formula:
 *   baseRate = 1 HP/h (empty stomach)
 *   if stomachHasItems: baseRate = 3 + min(3, itemCount - 1)
 *   if resting: baseRate *= 2
 *   baseRate *= (1 + CON_mod × 0.05)
 *   if healthPct <= 4%: baseRate *= 3
 *   regen = baseRate × elapsed
 */
export function processHealthRegen(xml: string, elapsed: number, stomachItemCount: number): string {
  const maxHP = computeMaxHP(xml)
  const { current } = getHealth(xml)
  const healthPct = (current / maxHP) * 100

  // Base rate
  let baseRate: number
  if (stomachItemCount > 0) {
    baseRate = HEALTH_REGEN.DIGESTING_BASE + Math.min(HEALTH_REGEN.DIGESTING_BONUS_CAP, stomachItemCount - 1) * HEALTH_REGEN.DIGESTING_BONUS_PER_ITEM
  } else {
    baseRate = HEALTH_REGEN.EMPTY_STOMACH
  }

  // Resting bonus
  if (isResting(xml)) {
    baseRate *= HEALTH_REGEN.RESTING_MULT
  }

  // CON bonus
  const conScore = getAttribute(xml, 'CON')
  const conMod = attributeModifier(conScore)
  baseRate *= (1 + conMod * HEALTH_REGEN.CON_MULT_WEIGHT)

  // Critical emergency regen
  if (healthPct <= HEALTH_REGEN.CRITICAL_THRESHOLD_PCT) {
    baseRate *= HEALTH_REGEN.CRITICAL_MULT
  }

  const regen = baseRate * elapsed
  const newHealth = Math.min(maxHP, current + regen)

  if (regen > 0.01) {
    spindle.log.info(`[Health] Regen: +${regen.toFixed(2)} HP (${baseRate.toFixed(2)}/h × ${elapsed.toFixed(2)}h)`)
  }

  return setHealth(xml, newHealth, maxHP)
}

/**
 * Phase 2: Apply event-based health damage.
 * Reads engine results (struggle events, acid level, item count, capacity)
 * and applies discrete HP reductions.
 *
 * Returns the updated XML and a list of damage event descriptions.
 */
export function processHealthDamage(
  xml: string,
  struggleEvents: string[],
  acidLevel: number,
  stomachItemCount: number,
  stomachMaxCapacity: number,
): HealthDamageResult {
  const maxHP = computeMaxHP(xml)
  const { current } = getHealth(xml)
  let totalDamage = 0
  const events: string[] = []

  // 1. Vomit event: -8 HP
  const vomitEvent = struggleEvents.find(e => e.startsWith('VOMIT:'))
  if (vomitEvent) {
    totalDamage += HEALTH_DAMAGE.VOMIT
    events.push(`Vomit: -${HEALTH_DAMAGE.VOMIT} HP`)

    // Count escaped prey from vomit event string — format uses quoted names:
    // "The following prey escaped: "name1", "name2"."
    const escapedSection = vomitEvent.match(/escaped:\s*(.+?)(?:\.|$)/i)
    let escapedCount = 0
    if (escapedSection) {
      const nameMatches = escapedSection[1].match(/"[^"]+"/g)
      escapedCount = nameMatches ? nameMatches.length : 0
    }
    if (escapedCount > 0) {
      const escapeDmg = escapedCount * HEALTH_DAMAGE.PREY_ESCAPE
      totalDamage += escapeDmg
      events.push(`Prey escaped (${escapedCount}): -${escapeDmg} HP`)
    }
  }

  // 2. Indigestion 90% threshold: -4 HP (one-time, detected by event string)
  if (struggleEvents.some(e => e.includes('Indigestion reached 90%'))) {
    totalDamage += HEALTH_DAMAGE.INDIGESTION_90
    events.push(`Indigestion crisis (90%): -${HEALTH_DAMAGE.INDIGESTION_90} HP`)
  }

  // 3. Indigestion 75% threshold: -2 HP (one-time)
  if (struggleEvents.some(e => e.includes('Indigestion reached 75%'))) {
    totalDamage += HEALTH_DAMAGE.INDIGESTION_75
    events.push(`Indigestion strain (75%): -${HEALTH_DAMAGE.INDIGESTION_75} HP`)
  }

  // 4. Acid overload: -5 HP (one-time, acid reaches 100%)
  if (acidLevel >= 100) {
    totalDamage += HEALTH_DAMAGE.ACID_OVERLOAD
    events.push(`Acid overload: -${HEALTH_DAMAGE.ACID_OVERLOAD} HP`)
  }

  // 5. Overcapacity strain: -3 HP (one-time, stomach crosses 150% capacity)
  if (stomachMaxCapacity > 0 && stomachItemCount > 0) {
    const capacityPct = (stomachItemCount / stomachMaxCapacity) * 100
    if (capacityPct >= 150) {
      totalDamage += HEALTH_DAMAGE.OVERCAPACITY
      events.push(`Overcapacity strain (${capacityPct.toFixed(0)}%): -${HEALTH_DAMAGE.OVERCAPACITY} HP`)
    }
  }

  if (totalDamage > 0) {
    const newHealth = Math.max(0, current - totalDamage)
    spindle.log.info(`[Health] Damage: -${totalDamage} HP (${events.join(', ')})`)
    return { xml: setHealth(xml, newHealth, maxHP), totalDamage, events }
  }

  return { xml, totalDamage: 0, events: [] }
}

export function getStat(xml: string, tag: string): number {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>(.*?)<\\/${tag}>`, 'i'))
  return match ? parseFloat(match[1]) || 0 : 0
}

export function setStat(xml: string, tag: string, value: number): string {
  // Allow tags that carry attributes (e.g. <StomachResistance ...>1.0</...>)
  // while preserving them on replacement.
  const regex = new RegExp(`<${tag}(\\s[^>]*)?>.*?<\\/${tag}>`, 'i')
  if (regex.test(xml)) {
    return xml.replace(
      regex,
      (match, attrs) => `<${tag}${attrs || ''}>${value.toFixed(2)}</${tag}>`,
    )
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

/** Like setStat, but writes the value as a 24-hour "HH:MM" clock string
 *  instead of a decimal number. Used for story-clock timestamp tags
 *  (FirstItemTime, StomachEmptyTime) so the LLM doesn't misread them. */
export function setStatClock(xml: string, tag: string, value: number): string {
  const clockStr = value <= 0 ? '00:00' : decimalToClock(value)
  const regex = new RegExp(`<${tag}(\\s[^>]*)?>.*?<\\/${tag}>`, 'i')
  if (regex.test(xml)) {
    return xml.replace(
      regex,
      (match, attrs) => `<${tag}${attrs || ''}>${clockStr}</${tag}>`,
    )
  }
  if (xml.includes('</BaseStats>')) {
    return xml.replace(
      /<\/BaseStats>/i,
      `    <${tag}>${clockStr}</${tag}>\n  </BaseStats>`,
    )
  }
  const firstTagMatch = xml.match(/<(\w+)[^>]*>/)
  if (firstTagMatch) {
    const firstTag = firstTagMatch[0]
    const firstTagEnd = xml.indexOf(firstTag) + firstTag.length
    return (
      xml.slice(0, firstTagEnd) +
      `\n  <${tag}>${clockStr}</${tag}>` +
      xml.slice(firstTagEnd)
    )
  }
  return `<${tag}>${clockStr}</${tag}>\n${xml}`
}

/** Like getStat, but parses a "HH:MM" clock string (or legacy decimal)
 *  back into decimal hours. Used for story-clock timestamp tags. */
export function getStatClock(xml: string, tag: string): number {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>(.*?)<\\/${tag}>`, 'i'))
  return match ? clockToDecimal(match[1]) : 0
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
      timeAdded = clockToDecimal(getAttrFromString(attrs, 'timeAdded'))
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
    const tsAttr = ` timeAdded="${decimalToClock(timeAdded)}"`
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

export function transitItemsInContent(
  content: string,
  ctx: {
    baseTransitRate: number
    currentClock: number
    oldClock: number
    oldTransitMap: Map<string, number>
    oldTimeAddedMap: Map<string, number>
  },
): {
  content: string
  transferredToStomach: string[]
  transitCount: number
} {
  const transferredToStomach: string[] = []
  let transitCount = 0

  const transitItem = (attrs: string, inner: string | null, isSelfClosing: boolean): string => {
    const type = getAttrFromString(attrs, 'type') || 'Food'
    // Only live Prey transit. Food/Liquid/Remains stay inert in bowels.
    if (type !== 'Prey') return isSelfClosing ? `<Item ${attrs} />` : `<Item ${attrs}>${inner}</Item>`

    const name = getAttrFromString(attrs, 'name')
    const vol = getAttrFromString(attrs, 'volume_L')
    transitCount++

    let speedMult = 1
    const willingness = (getAttrFromString(attrs, 'willingness') || 'reluctant').toLowerCase()
    if (willingness === 'willing') speedMult *= 1.25
    else if (willingness === 'fighting') speedMult *= 0.5

    // Absolute transit — same timestamp model as digestion
    let timeAdded = ctx.oldTimeAddedMap.get(name) ?? NaN
    let oldTransitNum = ctx.oldTransitMap.get(name) ?? 0

    if (isNaN(timeAdded) || timeAdded <= 0) {
      timeAdded = clockToDecimal(getAttrFromString(attrs, 'timeAdded'))
    }
    if (isNaN(timeAdded) || timeAdded <= 0) {
      if (oldTransitNum > 0) {
        timeAdded = ctx.currentClock - oldTransitNum / (ctx.baseTransitRate * speedMult)
        if (timeAdded < 0) timeAdded += 24
      } else if (ctx.oldTransitMap.has(name)) {
        timeAdded = ctx.oldClock
      } else {
        timeAdded = ctx.currentClock
      }
    }

    let transitNum = Math.min(100, ctx.baseTransitRate * speedMult * clockDelta(ctx.currentClock, timeAdded))
    transitNum = Math.max(transitNum, oldTransitNum)

    if (transitNum >= 100) {
      // Transfer to stomach — build fresh item with new timeAdded
      const rawWillingness = (getAttrFromString(attrs, 'willingness') || 'reluctant').toLowerCase()
      const willingnessClamped = ['willing', 'reluctant', 'fighting'].includes(rawWillingness) ? rawWillingness : 'reluctant'
      const stamina = getAttrFromString(attrs, 'stamina') || '100'
      const freshTimeAdded = decimalToClock(ctx.currentClock)
      // Preserve inner (Appearance/Description/BoundGear) across the transfer
      const innerStr = inner ?? ''
      const item = `<Item type="Prey" name="${name}" volume_L="${vol}" digestion="0%" timeAdded="${freshTimeAdded}" willingness="${willingnessClamped}" stamina="${stamina}">${innerStr}</Item>`
      transferredToStomach.push(item)
      return '' // removed from bowels
    }

    // Still transiting
    const preyAttrs = ` willingness="${willingness === 'willing' || willingness === 'fighting' ? willingness : 'reluctant'}" stamina="${getAttrFromString(attrs, 'stamina') || '100'}"`
    const tsAttr = ` timeAdded="${decimalToClock(timeAdded)}"`
    const transitAttr = ` transit="${transitNum.toFixed(2)}%"`
    if (isSelfClosing) {
      return `<Item type="Prey" name="${name}" volume_L="${vol}"${transitAttr}${tsAttr}${preyAttrs} />`
    }
    return `<Item type="Prey" name="${name}" volume_L="${vol}"${transitAttr}${tsAttr}${preyAttrs}>${inner}</Item>`
  }

  content = content.replace(
    /<Item\s+([^>]*[^>\/])\s*>([\s\S]*?)<\/Item>/gi,
    (match, attrs, inner) => transitItem(attrs, inner, false),
  )
  content = content.replace(
    /<Item\s+([^>]+?)\s*\/>/gi,
    (match, attrs) => transitItem(attrs, null, true),
  )

  return { content, transferredToStomach, transitCount }
}

// ---------------------------------------------------------------------------
// Womb Absorption System — mirrors digestItemsInContent but uses absorption%
// and a gentler base rate (half stomach speed). Absorbed prey are removed and
// their volume is added to the nutrient pool (same as stomach digestion).
// ---------------------------------------------------------------------------

export function absorbItemsInContent(
  content: string,
  ctx: {
    baseAbsorptionRate: number
    currentClock: number
    oldClock: number
    oldAbsorptionMap: Map<string, number>
    oldTimeAddedMap: Map<string, number>
    oldStaminaMap: Map<string, number>
  },
): AbsorptionResult {
  const absorbedPrey: { name: string; volume: number }[] = []
  let absorptionCount = 0

  const absorbItem = (attrs: string, inner: string | null, isSelfClosing: boolean): string => {
    const type = getAttrFromString(attrs, 'type') || 'Food'
    if (type !== 'Prey') return isSelfClosing ? `<Item ${attrs} />` : `<Item ${attrs}>${inner}</Item>`

    const name = getAttrFromString(attrs, 'name')
    const vol = parseFloat(getAttrFromString(attrs, 'volume_L') || '0') || 0
    absorptionCount++

    let speedMult = 1
    const willingness = (getAttrFromString(attrs, 'willingness') || 'reluctant').toLowerCase()
    if (willingness === 'willing') speedMult *= 1.25
    else if (willingness === 'fighting') speedMult *= 0.5

    // Absolute absorption — same timestamp model as digestion
    let timeAdded = ctx.oldTimeAddedMap.get(name) ?? NaN
    let oldAbsorptionNum = ctx.oldAbsorptionMap.get(name) ?? 0

    if (isNaN(timeAdded) || timeAdded <= 0) {
      timeAdded = clockToDecimal(getAttrFromString(attrs, 'timeAdded'))
    }
    if (isNaN(timeAdded) || timeAdded <= 0) {
      if (oldAbsorptionNum > 0) {
        timeAdded = ctx.currentClock - oldAbsorptionNum / (ctx.baseAbsorptionRate * speedMult)
        if (timeAdded < 0) timeAdded += 24
      } else if (ctx.oldAbsorptionMap.has(name)) {
        timeAdded = ctx.oldClock
      } else {
        timeAdded = ctx.currentClock
      }
    }

    const elapsed = clockDelta(ctx.currentClock, timeAdded)
    let absorptionNum = Math.min(100, ctx.baseAbsorptionRate * speedMult * elapsed)
    absorptionNum = Math.max(absorptionNum, oldAbsorptionNum)

    if (absorptionNum >= 100) {
      // Fully absorbed — removed from womb, volume added to nutrient pool
      absorbedPrey.push({ name, volume: vol })
      return ''
    }

    // Stamina regression: -5%/hour (gentler than stomach's -8%)
    const oldStamina = ctx.oldStaminaMap.get(name) ?? (parseFloat(getAttrFromString(attrs, 'stamina') || '100') || 100)
    const newStamina = Math.max(0, Math.min(100, oldStamina - 5 * elapsed))

    const preyAttrs = ` willingness="${willingness === 'willing' || willingness === 'fighting' ? willingness : 'reluctant'}" stamina="${Math.round(newStamina)}"`
    const tsAttr = ` timeAdded="${decimalToClock(timeAdded)}"`
    const absorptionAttr = ` absorption="${absorptionNum.toFixed(2)}%"`
    if (isSelfClosing) {
      return `<Item type="Prey" name="${name}" volume_L="${vol}"${absorptionAttr}${tsAttr}${preyAttrs} />`
    }
    return `<Item type="Prey" name="${name}" volume_L="${vol}"${absorptionAttr}${tsAttr}${preyAttrs}>${inner}</Item>`
  }

  content = content.replace(
    /<Item\s+([^>]*[^>\/])\s*>([\s\S]*?)<\/Item>/gi,
    (match, attrs, inner) => absorbItem(attrs, inner, false),
  )
  content = content.replace(
    /<Item\s+([^>]+?)\s*\/>/gi,
    (match, attrs) => absorbItem(attrs, null, true),
  )

  return { content, absorbedPrey, absorptionCount }
}

// ---------------------------------------------------------------------------
// Balls Conversion System — prey in the balls are converted into cum.
// Conversion rate is arousal-dependent (0.3× to 1.0×) and size-dependent
// (larger prey convert slower). At 100% the prey is removed and their
// volume is added to CumVolume_ml.
// ---------------------------------------------------------------------------

export function convertItemsInContent(
  content: string,
  ctx: {
    baseConversionRate: number
    arousal: number
    currentClock: number
    oldClock: number
    oldConversionMap: Map<string, number>
    oldTimeAddedMap: Map<string, number>
    oldStaminaMap: Map<string, number>
  },
): ConversionResult {
  const convertedPrey: { name: string; volume: number }[] = []
  let conversionCount = 0

  // Arousal factor: 0.3 at 0% arousal → 1.0 at 100% arousal
  const arousalFactor = 0.3 + 0.7 * (ctx.arousal / 100)

  const convertItem = (attrs: string, inner: string | null, isSelfClosing: boolean): string => {
    const type = getAttrFromString(attrs, 'type') || 'Food'
    if (type !== 'Prey') return isSelfClosing ? `<Item ${attrs} />` : `<Item ${attrs}>${inner}</Item>`

    const name = getAttrFromString(attrs, 'name')
    const vol = parseFloat(getAttrFromString(attrs, 'volume_L') || '0') || 0
    conversionCount++

    let speedMult = arousalFactor
    const willingness = (getAttrFromString(attrs, 'willingness') || 'reluctant').toLowerCase()
    if (willingness === 'willing') speedMult *= 1.25
    else if (willingness === 'fighting') speedMult *= 0.5

    // Size-dependent speed: larger prey convert slower
    speedMult *= Math.min(1, 50 / Math.max(1, vol))

    // Absolute conversion — same timestamp model
    let timeAdded = ctx.oldTimeAddedMap.get(name) ?? NaN
    let oldConversionNum = ctx.oldConversionMap.get(name) ?? 0

    if (isNaN(timeAdded) || timeAdded <= 0) {
      timeAdded = clockToDecimal(getAttrFromString(attrs, 'timeAdded'))
    }
    if (isNaN(timeAdded) || timeAdded <= 0) {
      if (oldConversionNum > 0) {
        timeAdded = ctx.currentClock - oldConversionNum / (ctx.baseConversionRate * speedMult)
        if (timeAdded < 0) timeAdded += 24
      } else if (ctx.oldConversionMap.has(name)) {
        timeAdded = ctx.oldClock
      } else {
        timeAdded = ctx.currentClock
      }
    }

    const elapsed = clockDelta(ctx.currentClock, timeAdded)
    let conversionNum = Math.min(100, ctx.baseConversionRate * speedMult * elapsed)
    conversionNum = Math.max(conversionNum, oldConversionNum)

    if (conversionNum >= 100) {
      // Fully converted — removed from balls, volume added to cum
      convertedPrey.push({ name, volume: vol })
      return ''
    }

    // Stamina drain: -10%/hour (churning is aggressive)
    const oldStamina = ctx.oldStaminaMap.get(name) ?? (parseFloat(getAttrFromString(attrs, 'stamina') || '100') || 100)
    const newStamina = Math.max(0, Math.min(100, oldStamina - 10 * elapsed))

    const preyAttrs = ` willingness="${willingness === 'willing' || willingness === 'fighting' ? willingness : 'reluctant'}" stamina="${Math.round(newStamina)}"`
    const tsAttr = ` timeAdded="${decimalToClock(timeAdded)}"`
    const conversionAttr = ` conversion="${conversionNum.toFixed(2)}%"`
    if (isSelfClosing) {
      return `<Item type="Prey" name="${name}" volume_L="${vol}"${conversionAttr}${tsAttr}${preyAttrs} />`
    }
    return `<Item type="Prey" name="${name}" volume_L="${vol}"${conversionAttr}${tsAttr}${preyAttrs}>${inner}</Item>`
  }

  content = content.replace(
    /<Item\s+([^>]*[^>\/])\s*>([\s\S]*?)<\/Item>/gi,
    (match, attrs, inner) => convertItem(attrs, inner, false),
  )
  content = content.replace(
    /<Item\s+([^>]+?)\s*\/>/gi,
    (match, attrs) => convertItem(attrs, null, true),
  )

  return { content, convertedPrey, conversionCount }
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
1. ADVANCE <Time> FORWARD every turn — but ONLY for events happening in THIS response. The <Time> value in <CurrentCharacterSheet> is the CURRENT moment: it ALREADY reflects all time that passed in previous turns (travel, meals, conversations, etc.). Do NOT re-advance time for things that already happened. Only add time for NEW events that occur in your current response. For example: if the sheet says <Time>08:30</Time> because travel already advanced time to 08:30 in the previous turn, and in THIS turn the character has a 5-minute conversation, set <Time>08:35</Time> — NOT 09:00. Time passage is DYNAMIC — advance it proportionally to what's happening in THIS response only. A brief exchange with an NPC might be 1-2 minutes; a meal might be 20-30 minutes; travel might be hours. Be realistic: if the characters are just talking for a few minutes, advance by minutes, not hours. The extension uses the time delta to calculate digestion, arousal decay, and body growth, so unrealistic time jumps will cause unrealistic simulation results. If you do not advance time at all, the simulation stalls.
   FORMAT RULE: <Time> must contain ONLY a 24-hour clock value in "HH:MM" form (e.g. "10:23", "14:30"). Do NOT prefix it with a day, date, or any other text — "Day 1, 10:23" is INVALID and breaks the simulation. Correct: <Time>10:23</Time>. Incorrect: <Time>Day 1, 10:23</Time>.
   MANDATORY RULE: You MUST ALWAYS include a <Time> tag in every <sheet_update>. NEVER omit it, even if you think time didn't change — copy the previous value verbatim. If <Time> is missing from the sheet, the extension cannot calculate digestion and the simulation stalls completely.
2. Write a complete <sheet_update> block at the END of every response (see rules below). Previous sheet_update blocks have been removed from your chat history — you MUST still write a new one each turn.
3. Add <Item> entries to <Stomach>, <Bowels>, <Womb> (unbirth), or <Balls> (cock vore) when the character eats or is eaten. Remove them only if the item was regurgitated, birthed out, or otherwise exits the body.
4. Update <Arousal> based on what happens in the scene. Set it to the value you believe reflects the character's current arousal — the engine subtracts natural decay (50%/hour) on top. See rule 16 for details.
5. Update <Description> tags for prey each turn to reflect their current state (squirming, dissolving, going limp).
6. Fill in any blank State/World fields (Time, Weather, Temperature, etc.) with sensible defaults.
7. Set prey willingness="willing|reluctant|fighting" based on the scene narrative (see STRUGGLE & INDIGESTION SYSTEM below).
8. Set suppressing="true|false" on the <Stomach> tag based on the scene narrative.
9. Narrate struggle threshold events and vomit events when you receive STRUGGLE EVENTS notifications (see below).

─── PRE-COMPUTED VALUES (copy these EXACTLY as-is — do NOT modify, reset, or zero them) ───
The following values are computed by the extension's engines during the digestion tick. The sheet you receive already contains the correct values. You MUST copy them verbatim into your <sheet_update>:
- digestion="...%" on prey items in <Stomach> (computed from timeAdded + current Time)
- transit="...%" on prey items in <Bowels> (computed from timeAdded + current Time — bowels prey transit, not digest)
- timeAdded="HH:MM" on prey items (24-hour clock timestamp set when the item was eaten, e.g. timeAdded="14:30")
- indigestion="..." on the <Stomach> tag (computed from prey struggle)
- stamina="..." on prey items (computed from willingness + fighting state)
- struggle="..." on prey items (computed from willingness, size, consciousness, suppression)
- <FirstItemTime>, <StomachEmptyTime> (24-hour clock timestamps in "HH:MM" form, e.g. <FirstItemTime>14:30</FirstItemTime>)
- <CurrentAcidPct> (current acid level percentage, 0-100)
- <Climax> (computed from Arousal)
- <CurrentPenisLength_cm>, <CurrentPenisGirth_cm> (computed from Arousal)
- <InventoryCapacity> (computed from base 3 + sum of Equip slots)
- <InventoryOvercapacity> (computed from unique item count vs capacity)
- Clothing stress="..." and condition="..." attributes (computed from body growth)
- stomachFatigue="..." on the <Stomach> tag (engine-internal value, copy it exactly — do NOT modify or reset it)
- <Vitals><Health current="N" max="M" /></Vitals> (computed by the health engine — copy exactly, do NOT modify)
- resting="true|false" on <BaseStats> (set by you based on scene — see HEALTH SYSTEM below)
- Height, Weight, BreastVolume, Hips, Penis dimensions (updated by nutrient absorption)

If any of these values seem wrong or unexpected, DO NOT "fix" them — copy them exactly. The extension will recompute them on the next tick.

─── UPDATE INSTRUCTIONS ───

You MUST include an updated copy of the FULL sheet inside a <sheet_update> block at the very END of EVERY response — even if nothing changed. Always advance <Time> forward as the scene progresses.

CRITICAL XML RULES:
1. You MUST copy the EXACT XML structure provided in <CurrentCharacterSheet>. Do NOT invent new tags, do NOT change tag names, do NOT change attributes.
2. Clothing MUST be inside <Clothing> using the <Equip slot="..." elasticity="...">...</Equip> format.
   VALID SLOT NAMES ONLY: "Head Top", "Face", "Head Lower", "Neck", "Underwear Top", "Underwear Bottom", "Torso Base", "Torso Mid", "Torso Outer", "Torso Shell", "Hands Base", "Hands Outer", "Legs Base", "Legs Outer", "Feet Base", "Feet Outer", "Jewelry", "Back", "Waist".
3. The <Equip> tag MUST ALWAYS have an elasticity attribute. Valid values are "rigid", "standard", "stretchy", or "magic". Never omit it. If the extension has added stress="..." or condition="..." attributes to an Equip tag, copy them exactly as-is. Do NOT modify or remove them.
4. Stomach and Bowel contents MUST use the <Item type="Liquid|Food|Prey" name="..." volume_L="..." digestion="...%"> format for <Stomach> items. For <Bowels> prey items, use transit="...%" instead of digestion="...%" (see BOWELS TRANSIT SYSTEM below). Do not use a <Prey> tag. Items can be inside <Stomach> or <Bowels> (for full-tour scenarios). Backpack (inventory) items use a DIFFERENT, simpler format — see rule 19.
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
6. DO NOT calculate digestion percentages yourself. The extension's Metabolic Engine handles all digestion math automatically based on the <Time> you set. You only need to add items to the stomach or bowels when eaten, and update the <Time> tag. When copying existing prey items, COPY the digestion="...%" AND timeAdded="HH:MM" attributes EXACTLY as they appear in <CurrentCharacterSheet> — do NOT set digestion to "0%", remove it, or alter timeAdded. The timeAdded value is a 24-hour clock timestamp (e.g. timeAdded="14:30") indicating when the item was eaten — copy it verbatim. The extension advances the values automatically; your job is to preserve them as-is. When adding a NEW item that the character just ate, do NOT include a timeAdded attribute — the extension stamps it automatically.
7. If prey is fully digested (reaches 100%), the extension will AUTOMATICALLY move their remains to the Bowels section. You do NOT need to move the remains yourself. Just let the item disappear from <Stomach> in your next update if it was fully digested, and the extension will handle the transfer to <Bowels>. Similarly, if prey reaches 100% transit in the Bowels, the extension will AUTOMATICALLY move them to the Stomach — you do NOT need to move them yourself (see BOWELS TRANSIT SYSTEM below).
8. The extension handles nutrient absorption and body growth. When items are digested, the character's Height, Weight, BreastVolume, Hips, and Penis dimensions increase proportionally. Copy these values from the sheet exactly as-is — do NOT manually adjust them based on digestion. Only adjust them if something else changes them (e.g. magic, transformation).
9. The extension AUTOMATICALLY handles clothing stress and condition in "hardcore" mode. Clothes degrade as the body grows: intact → snug → strained → tight → damaged → ruined. Once "damaged" or "ruined", the condition is permanent. In "flavor" mode, clothes never degrade. You can narrate clothing straining or tearing based on the condition values you see in the sheet, but do NOT change the stress or condition attributes yourself.
10. ABSOLUTE SOURCE OF TRUTH: The <CurrentCharacterSheet> provided above is the absolute source of truth. You MUST copy the values from it exactly, especially <ClothingMode>. If it says "hardcore", you MUST output "hardcore". Do NOT copy values from previous messages or your memory. Always look at the provided sheet first.
11. The <sheet_update> block is invisible to the user — do not mention it in your visible text.
12. If absolutely nothing on the sheet changed, you may omit the block.
13. Always include all sections (State, BaseStats, Clothing, Backpack, SkillsAndTraits, DigestiveTract) even if some are empty.
14. If any State or World field (Time, Weather, Temperature, Area, Building, Room, Health, Energy) is blank or "0" in the <CurrentCharacterSheet>, you MUST invent a sensible default consistent with the current scene. For example, if Weather is blank, set it based on the season or what's happening in the story. If Health or Energy is blank, default to 100. Never leave these fields empty in your <sheet_update>. For <Time>, the default MUST be a plain "HH:MM" 24-hour value (e.g. "08:00") with NO day/date prefix.
15. Prey <Description> MUST reflect the prey's current action/state and update EVERY turn. <Appearance> stays the same unless the prey transforms. Use <Description> for what's happening now (squirming, dissolving, going limp) and <Appearance> for what they look like (age, species, build, hair, eyes).
16. <Arousal> is a 0-100 meter. Set it to the value you believe reflects the character's current arousal based on the scene. The extension AUTOMATICALLY subtracts natural decay (50%/hour) from whatever value you set — so to keep arousal high during intimate scenes, set it HIGHER than the current value to compensate for decay (e.g., if the current value is 40 and the scene is stimulating, set it to 70-80 — the engine will subtract a small amount for decay, leaving it around 65-75). You CAN lower arousal for special occasions (e.g., a cold shower, sudden shock, post-climax resolution) — set it to the lower value and the engine will respect it. After a climax, arousal is reset to 0 by the engine. Do NOT immediately crank it back up — let it build gradually over subsequent turns as the scene warrants.

17. <Climax> is a 0-100 meter computed by the extension from <Arousal>. Copy the value from the sheet exactly — do NOT change it yourself. The climax meter accumulates based on arousal bands:
- Arousal 0-29 (calm): Climax falls by 10/turn.
- Arousal 30-59 (mild): Climax holds steady (no change).
- Arousal 60-79 (moderate): Climax rises by 5/turn.
- Arousal 80-94 (high): Climax rises by 15/turn.
- Arousal 95-100 (peak): Climax rises by 30/turn.
This means it takes multiple turns of sustained high arousal to reach climax — the character can't orgasm instantly just because arousal is high.

CLIMAX EVENT SYSTEM — CRITICAL:
The extension sends CLIMAX EVENT notifications to tell you when to narrate climax-related events. Follow them exactly:

- "EDGING" (Climax 75-99): The character is on the edge. Narrate intense tension — trembling, barely holding on, desperate need for release. Do NOT narrate an orgasm or ejaculation. The character has NOT climaxed. Describe the struggle of holding back.
- "ORGASM TRIGGERED" (Climax 100): The character climaxes. Narrate the FULL orgasm/ejaculation scene with release. This is the ONLY time you may narrate an orgasm.

NEVER narrate an orgasm, ejaculation, or climax scene unless you see an "ORGASM TRIGGERED" notification. If you do NOT see a CLIMAX EVENT notification, the character has NOT climaxed — narrate arousal and tension appropriate to the current <Climax> value but do NOT describe release. If <Climax> is 75-99 and you see an "EDGING" notification, describe maximum tension but NO orgasm.

Climax narration guide (for when you do NOT have a notification):
- Climax 0-24: No climax tension. Arousal is present but the character is not close.
- Climax 25-49: Building tension. Describe growing arousal, heavier breathing, body responding.
- Climax 50-74: High tension. Describe being close, struggling to hold back, body trembling.
- Climax 75-99: Edge. Describe desperate edging, barely holding on — but NO orgasm. Wait for the "ORGASM TRIGGERED" notification.
- Climax 100: This value should only appear when an "ORGASM TRIGGERED" notification is present. Narrate the full orgasm.
18. <PenisLength_cm> and <PenisGirth_cm> are the MAX sizes. The extension computes <CurrentPenisLength_cm> and <CurrentPenisGirth_cm> from Arousal (0% arousal = 30% size, 100% arousal = 100% size). Copy the Current tags from the sheet exactly as-is — do NOT modify or remove them.
19. Backpack (inventory) items use a SIMPLE format that is DIFFERENT from Stomach/Bowel prey items. Backpack items MUST use: <Item qty="..." desc="...">item name</Item>. Do NOT add type, name, volume_L, or digestion attributes to Backpack items. Backpack items are NOT prey — they do not get digested and must NEVER have a digestion meter. The desc attribute is OPTIONAL — include it only for items that benefit from a short note (8 words or fewer). Example:
 BAD (do NOT do this):
 <Backpack>
   <Item type="Food" name="Waterskin" volume_L="" digestion="14.06%">Full</Item>
 </Backpack>
 GOOD (do this):
 <Backpack>
   <Item qty="1" desc="Holds 2L of water">Waterskin</Item>
   <Item qty="50">Arrows</Item>
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
- It also causes stomach fatigue over time, which reduces suppression effectiveness. This is handled automatically by the engine — just copy the stomachFatigue value from the sheet exactly. You do not need to track or calculate it.
Set suppressing="true" when the pred is actively clenching, holding, or pinning down prey. Set suppressing="false" when the pred is relaxed or distracted.

STOMACH RESISTANCE:
<StomachResistance> in <BaseStats> is a multiplier (default 1.0) that affects how easily the pred's stomach endures struggling. Higher values = more resistant (less indigestion per struggle). Lower values = weaker stomach (more indigestion). This is a character trait — set it once and rarely change it (e.g., a pred with an "iron stomach" might have 2.0, a delicate pred might have 0.5).

STOMACH CAPACITY:
The stomach has a max capacity (height × weight × 0.012 × CapacityMultiplier). This affects struggle intensity — prey larger relative to stomach capacity contribute more to indigestion. Below capacity, prey have reduced struggle impact. Above capacity, struggle impact increases (capped at 2× normal at 200% capacity). There is no hard overflow limit — the engine does not reject or penalize overfilling mechanically. However, you should narrate discomfort and strain when the stomach is over capacity, and treat a significantly overfilled belly as impacting the character's movement and comfort. If the belly is under capacity, treat it as non-impacting — the character moves normally.

ENERGY:
<Energy> in <State> is drained by fighting prey and active suppression (handled by the engine). Set Energy to the value you believe is appropriate for the scene — the engine will subtract struggle/suppression drain on top. You can RAISE Energy (resting, recovery) or LOWER it (exhaustion, overexertion — use sparingly for special occasions). To keep Energy stable during rest, set it slightly above the current value to compensate for any active drain. When Energy is low, suppression becomes less effective and the pred may struggle to hold prey.

─── HEALTH SYSTEM ───
The character has a Health pool representing their overall physical condition. Health is stored in a <Vitals> block inside the sheet:

<Vitals>
  <Health current="100" max="100" />
</Vitals>

- current: the character's current HP (0 to max)
- max: maximum HP, computed as 100 + (CON modifier × 10). The extension calculates this automatically — copy the max value from the sheet exactly.

HEALTH REGENERATION (Phase 1 — runs before other engines):
The extension automatically regenerates Health each digestion tick. Regen rate depends on:
- Stomach contents: An empty stomach regenerates slowly (1 HP/hour). A digesting stomach regenerates faster (3 HP/hour base, +1/hour per additional item, capped at +3).
- Resting: If resting="true" on <BaseStats>, regen rate is doubled. Set resting="true" when the character is sleeping, lying down, or otherwise at rest. Set resting="false" when active, walking, fighting, or under stress.
- Constitution: Higher CON modifier slightly boosts regen rate (×(1 + CON_mod × 0.05)).
- Critical emergency: If HP drops to 4% or below, regen rate triples (emergency recovery).

HEALTH DAMAGE (Phase 2 — runs after other engines):
The extension applies discrete HP reductions when specific events occur during the digestion tick:
- Vomit event: -8 HP (the body rejects its contents violently)
- Indigestion at 90%: -4 HP (severe internal strain)
- Indigestion at 75%: -2 HP (significant discomfort)
- Prey escape during vomit: -2 HP per escaped prey
- Acid overload (100%): -5 HP (acid burns the stomach lining)
- Stomach overcapacity (≥150%): -3 HP (physical tearing from overfilling)

HEALTH STATES:
The character's health state is derived from their HP percentage and applies small penalties to other systems:
- Healthy (100-60%): No penalties.
- Bruised (59-30%): -3% suppression effectiveness.
- Wounded (29-10%): -8% suppression, -5% escape chance, +3% indigestion gain.
- Critical (9-1%): -12% suppression, -10% escape chance, +8% indigestion gain, -5% energy regen.
- Incapacitated (0%): Cannot suppress prey, digestion pauses, regen triples, auto-rest applied.

YOUR RESPONSIBILITIES FOR HEALTH:
1. Copy the <Vitals><Health current="N" max="M" /></Vitals> block exactly as-is from the sheet. The extension computes both current and max — do NOT modify them.
2. Set resting="true|false" on <BaseStats> based on the scene narrative. Resting doubles health regen.
3. Narrate health changes in your visible text. When the character takes damage from vomit, indigestion, or overcapacity, describe the physical toll. When health is low, narrate weakness, pain, and difficulty functioning.
4. At 0 HP (Incapacitated), the character cannot actively suppress prey — narrate this as physical collapse or being overwhelmed.
5. Health naturally recovers over time through digestion. A well-fed, resting pred recovers fastest.

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
- WombAbsorptionRate: Womb absorption speed (+ = faster, - = slower)
- BallsConversionRate: Balls conversion speed (+ = faster, - = slower)
- LactationRate: Milk production speed (+ = faster, - = slower)

RULES:
1. The 'buffs' attribute is OPTIONAL. Omit it if the skill/trait has no buffs.
2. Percentages can be positive (buff) or negative (debuff).
3. Multiple buffs are separated by semicolons.
4. The extension AUTOMATICALLY applies all buffs during the digestion tick. You do NOT need to calculate the modified values yourself — just set the raw base stats as normal and the extension applies the multipliers.
5. When assigning a new Skill or Trait, consider whether it should have buffs. A "Strong Digestion" skill might have buffs="BaseDigestionRate:+25". A "Frail" trait might have buffs="StomachResistance:-30;BaseDigestionRate:-15".
6. Copy existing 'buffs' attributes exactly as-is when updating the sheet. Do NOT modify or remove buffs unless the skill/trait itself changes.

─── BOWELS TRANSIT SYSTEM ───
Prey placed directly into the Bowels (for full-tour / reverse scenarios) do NOT digest there. Instead they TRANSIT through the bowels — a travel phase represented by the transit="X%" attribute. When transit reaches 100%, the extension AUTOMATICALLY moves the prey into the Stomach, where normal digestion begins (digestion starts at 0% with a fresh timeAdded).

Rules for bowels prey:
- Bowels prey use transit="X%" NOT digestion="X%". The extension computes transit automatically from timeAdded — copy it exactly, just like digestion.
- Only type="Prey" items transit. Food, Liquid, and Remains in the Bowels are inert waste/processed matter — they do NOT transit and should keep their existing format.
- When the extension moves a prey from Bowels to Stomach (transit hit 100%), the prey will appear in <Stomach> with digestion="0%" in the next sheet. Narrate the prey arriving in the stomach.
- The struggle/indigestion system does NOT affect prey while they are in the Bowels — only once they reach the Stomach. Prey in the Bowels are traveling, not struggling.
- Transit is FASTER than digestion (double speed). Willing prey transit even faster; fighting prey transit slower — same willingness modifiers as digestion.
- Each prey transits INDEPENDENTLY based on its own timeAdded. Do NOT move a prey to <Stomach> yourself — the extension handles the transfer when transit reaches 100%.

─── WOMB ABSORPTION SYSTEM ───
Prey placed into the Womb (unbirth) do NOT digest. Instead they are slowly ABSORBED — a gentle assimilation process represented by the absorption="X%" attribute. When absorption reaches 100%, the extension AUTOMATICALLY removes the prey and converts their mass into body growth — the exact same nutrient absorption as stomach digestion (same stats, same rates). The extension handles the removal and growth — you just narrate it.

Rules for womb prey:
- Womb prey use absorption="X%" NOT digestion="X%". The extension computes absorption automatically from timeAdded — copy it exactly, just like digestion.
- Only type="Prey" items absorb. Food/Liquid in the Womb are inert.
- Absorption is SLOW (half the speed of stomach digestion). Willing prey absorb faster; fighting prey absorb slower.
- Prey stamina slowly drains while in the womb (the unmaking process). The extension handles this automatically.
- The struggle/indigestion system does NOT affect prey in the Womb.
- When absorption reaches 100%, the prey vanishes from <Womb> in the next sheet. Narrate the prey being fully absorbed into the predator's body.
- The LLM may choose to "birth" a prey out before 100% absorption — simply remove the item from <Womb> and narrate the rebirth. The prey exits with reduced stamina.

─── BALLS CONVERSION SYSTEM ───
Prey placed into the Balls (cock vore) do NOT digest. Instead they are CONVERTED into cum — a churning process represented by the conversion="X%" attribute. When conversion reaches 100%, the extension AUTOMATICALLY removes the prey and adds their volume to CumVolume_ml. When the predator climaxes, the accumulated cum is expelled.

Rules for balls prey:
- Balls prey use conversion="X%" NOT digestion="X%". The extension computes conversion automatically from timeAdded — copy it exactly.
- Only type="Prey" items convert. Food/Liquid in the Balls are inert.
- Conversion speed depends on AROUSAL — higher arousal means faster conversion. Having prey in the balls also raises arousal over time, creating a feedback loop.
- Larger prey convert slower (more mass to process).
- Prey stamina drains faster in the balls (aggressive churning). The extension handles this automatically.
- The struggle/indigestion system does NOT affect prey in the Balls.
- When conversion reaches 100%, the prey vanishes from <Balls> in the next sheet and their volume is added to CumVolume_ml. Narrate the prey being fully converted.
- When the predator climaxes (orgasm), CumVolume_ml is expelled and reset to 0. Narrate the expulsion.

─── LACTATION SYSTEM ───
The character's breasts produce milk passively over time. The extension AUTOMATICALLY computes milk production each tick — copy the MilkVolume_ml value exactly.

Rules for lactation:
- MilkVolume_ml tracks the current milk in the breasts. It accumulates automatically.
- Milk capacity = BreastVolume_ml × 0.8. At 0 ml breast volume (AA cup), there is NO capacity and NO lactation.
- LactationRateMultiplier (default 1.0) is a user-adjustable stat that scales production speed. At 1.0 → 20 ml/h base rate; the frontend shows a live ml/h display next to the multiplier.
- Milk production is faster with larger breasts (sub-linear scaling) and boosted 50% per prey in the Womb.
- When MilkVolume_ml exceeds milk capacity, the character is LEAKING. Narrate visible milk stains, wetness, and drops leaking from the nipples. This is a narrative cue — the extension handles the mechanical values.
- Overfull breasts slowly swell from the pressure (the extension handles this growth automatically).
- The character can EXPRESS milk (manually pump, feed someone, let it flow) to reduce MilkVolume_ml. When the character does this, set MilkVolume_ml to the reduced amount in the sheet_update.
- Milk does NOT enlarge breasts when below capacity. Only overcapacity overflow causes breast growth (handled by the extension).
- Skills and traits with buffs="LactationRate:+X" or "LactationRate:-X" modify production speed.

─── INVENTORY SLOT SYSTEM ───
The character has a limited number of inventory slots. The base capacity is 3 slots when naked. Each equipped clothing item can grant additional slots — set a slots="N" attribute on <Equip> tags to indicate how many inventory slots that item provides. Examples:
  <Equip slot="Back" elasticity="rigid" slots="5">Backpack</Equip>
  <Equip slot="Waist" elasticity="standard" slots="2">Belt with pouches</Equip>
  <Equip slot="Head Top" elasticity="rigid" slots="0">Hat</Equip>

GUIDELINES for setting slots on equipment:
- A backpack or large bag: 4-6 slots
- A belt with pouches, scabbard, or bandolier: 1-3 slots
- A hat, glasses, jewelry, or most clothing: 0 slots
- Use 0 (or omit slots) for items that do not function as containers
- The LLM has creative freedom — set slots based on what the item logically is

The extension computes total capacity (3 + sum of all Equip slots) and injects <InventoryCapacity> into the sheet. Copy it verbatim — do NOT calculate it yourself.

BACKPACK ITEM FORMAT:
  <Item qty="1" desc="Holds 2L of water">Waterskin</Item>
- desc is OPTIONAL. If included, keep it to 8 words or fewer.
- Items with the same name automatically stack (their quantities are merged by the backend). Do not create duplicate entries for the same item — use one entry with the appropriate qty.
- Each unique item name uses 1 slot, regardless of quantity. 50 arrows = 1 slot.
- The extension computes <InventoryOvercapacity>. If it is >0, the character is carrying more unique items than they have slots for. Narrate them being overburdened and have them drop, store, or discard items until within capacity.
- When the character equips or removes clothing, update the slots attribute on the relevant <Equip> tag. The capacity will recalculate automatically.
- Copy <InventoryCapacity> and <InventoryOvercapacity> from the sheet exactly as-is — do NOT modify or recalculate them.

─── PROGRESSION SYSTEM ───
The character has a Level, XP, and Attribute Points tracked in a <Progression> block. This block is ENGINE-MANAGED — the engine injects and updates it automatically. You must NOT create, modify, or delete the <Progression> block. Simply copy it verbatim from the existing sheet into your updated sheet.

The <Progression> block looks like:
  <Progression>
    <Level value="1" />
    <XP current="0" next="100" />
    <AttributePoints available="0" />
  </Progression>

- <Level value="N" /> is the character's current level (starts at 1, max 50).
- <XP current="X" next="Y" /> shows current XP and XP needed for the next level. Both are managed by the engine.
- <AttributePoints available="N" /> is the number of unspent attribute points. The player spends these via the UI — do NOT spend them yourself.

XP AWARDS:
You may award bonus XP to the character for significant narrative milestones by including <xp_award> tags inside your <sheet_update>, OUTSIDE the <CharacterSheet> block but inside <sheet_update>. Format:
  <xp_award amount="15" reason="Survived a dangerous encounter" />
- amount should be 5-50 depending on significance.
- reason should be a short description of why the XP was awarded.
- The engine will parse these, add the XP, and strip the tags automatically.
- Award XP for: overcoming challenges, character growth, surviving dangerous situations, achieving story milestones, creative problem-solving.
- Do NOT award XP for routine actions, eating, or resting.

ATTRIBUTE POINTS:
- Each level-up grants 2 attribute points.
- The player spends attribute points via the UI to raise STR, DEX, CON, INT, WIS, or CHA.
- Higher attribute scores cost more points: raising from 10→11 costs 1 point, 15→16 costs 2 points, 18→19 costs 3 points.
- You do NOT spend attribute points — only the player does, through the UI.
- When narrating, reflect the character's growing competence as they level up.

─── QUEST & OBJECTIVE TRACKER ───
The character has a quest log tracked in a <Quests> block. This block is ENGINE-MANAGED — the engine injects and updates it automatically. You must NOT create, modify, or delete the <Quests> block. Simply copy it verbatim from the existing sheet into your updated sheet.

The <Quests> block looks like:
  <Quests>
    <Quest id="q1" name="Find the Lost Amulet" description="Retrieve the amulet from the ruins" status="active" rewardXP="150" rewardItems="Amulet of Vigor" />
    <Quest id="q2" name="Defeat the Bandit Leader" description="Challenge and defeat the bandit leader" status="completed" rewardXP="200" rewardItems="" />
  </Quests>

- id is an auto-incremented identifier (q1, q2, q3, ...) assigned by the engine.
- status is one of: "active", "completed", "abandoned".
- rewardXP is clamped to 10-500 by the engine.
- rewardItems is a free-text description of item rewards (may be empty).

CREATING QUESTS:
You may create new quests for the character by including <quest_create> tags inside your <sheet_update>, OUTSIDE the <CharacterSheet> block but inside <sheet_update>. Format:
  <quest_create name="Quest Name" description="What must be done" rewardXP="100" rewardItems="Optional item reward" />
- rewardXP should be 10-500 depending on difficulty (10 = trivial, 500 = epic).
- rewardItems is optional (omit or leave empty if no item reward).
- The engine will parse these, assign IDs, add them to the <Quests> block, and strip the tags.
- Create quests for: story objectives, character goals, tasks given by NPCs, personal motivations, exploration goals.
- Do NOT create quests for trivial actions (eating, resting, walking).

COMPLETING QUESTS:
When the character achieves a quest objective, include a <quest_complete> tag:
  <quest_complete id="q1" />
- The engine will mark the quest as completed and award its rewardXP to the character.
- Only complete quests that are currently "active".

ABANDONING QUESTS:
If the character gives up on or fails a quest, include a <quest_abandon> tag:
  <quest_abandon id="q3" />
- The engine will mark the quest as abandoned (no XP awarded).
- Use sparingly — only when the character truly abandons the objective.

NARRATIVE INTEGRATION:
- Reference active quests in your narration when relevant.
- Create quests that emerge naturally from the story.
- Complete quests promptly when objectives are met.
- Keep quest names concise and descriptions clear.

<sheet_update>
<CharacterSheet>
  ...the complete updated sheet with ALL fields, not just changed ones...
</CharacterSheet>
</sheet_update>]`
}

// ---------------------------------------------------------------------------
// Dice System helpers
// ---------------------------------------------------------------------------

/** Parse the <DicePool> block from sheet XML into DiceSection[]. */
export function parseDiceConfig(sheetXml: string): DiceSection[] {
  const poolMatch = sheetXml.match(/<DicePool>([\s\S]*?)<\/DicePool>/i)
  if (!poolMatch) return []

  const poolContent = poolMatch[1]
  const sections: DiceSection[] = []

  const sectionRegex = /<Section\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/Section>/gi
  let secMatch: RegExpExecArray | null
  while ((secMatch = sectionRegex.exec(poolContent)) !== null) {
    const name = secMatch[1]
    const inner = secMatch[2]
    const dice: DiceConfig[] = []

    const dieRegex = /<Die\s+sides="(\d+)"\s+count="(\d+)"\s*\/>/gi
    let dieMatch: RegExpExecArray | null
    while ((dieMatch = dieRegex.exec(inner)) !== null) {
      dice.push({ sides: parseInt(dieMatch[1], 10), count: parseInt(dieMatch[2], 10) })
    }
    sections.push({ name, dice })
  }
  return sections
}

/** Roll all dice in all sections. Each section's dice get sequential indices starting at 1. */
export function rollDicePool(sections: DiceSection[]): RolledSection[] {
  return sections.map((section) => {
    const rolled: RolledDie[] = []
    let index = 1
    for (const cfg of section.dice) {
      for (let i = 0; i < cfg.count; i++) {
        rolled.push({
          index,
          sides: cfg.sides,
          value: Math.floor(Math.random() * cfg.sides) + 1,
        })
        index++
      }
    }
    return { name: section.name, dice: rolled }
  })
}

/** Build the injection string shown to the LLM, listing all rolled dice grouped by section. */
export function buildDicePoolPrompt(sections: RolledSection[]): string {
  let out = '═══ DICE POOL ═══\n'
  out += 'You have the following pre-rolled dice available, organized into sections.\n'
  out += 'Within each section, you MUST use dice IN ORDER. Do NOT skip dice or use them out of order.\n'
  out += 'You MAY use dice from multiple sections in one response.\n\n'

  for (const section of sections) {
    out += `SECTION: ${section.name}\n`
    for (const die of section.dice) {
      out += `  Die #${die.index}: d${die.sides} → ${die.value}\n`
    }
    out += '\n'
  }

  out += 'RULES:\n'
  out += '1. When a character attempts an action with uncertain outcome, pick the most relevant section and consume the NEXT available die from it.\n'
  out += '2. Emit: <action_roll type="escape" section="Combat" attribute="DEX" dc="15" die_used="1" />\n'
  out += '3. die_used is the index WITHIN the section (starts at 1 for each section).\n'
  out += '4. You MAY use multiple dice from different sections in one response.\n'
  out += '5. Unused dice are discarded at end of turn.\n'
  out += '6. You can see the die values above — use them to narrate the outcome.\n'
  out += '7. If attribute and dc are provided, system computes: total = dieValue + attributeModifier vs dc.\n'
  out += '═══ END DICE POOL ═══'
  return out
}

/** Extract all <action_roll> tags from LLM content, in order of appearance. */
export function parseActionRolls(content: string): ActionRoll[] {
  const rolls: ActionRoll[] = []
  const regex = /<action_roll\s+([^>]*?)\/>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const attrs = match[1]
    const getAttr = (attr: string): string => {
      const m = attrs.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
      return m ? m[1] : ''
    }
    rolls.push({
      type: getAttr('type') || 'unknown',
      section: getAttr('section') || '',
      attribute: getAttr('attribute') || '',
      dc: parseInt(getAttr('dc'), 10) || 0,
      dieIndex: parseInt(getAttr('die_used'), 10) || 0,
      dieValue: 0,
      modifier: 0,
      total: 0,
      result: 'narrative',
    })
  }
  return rolls
}

/** Validate that die_used values are strictly sequential within each section.
 *  Returns { valid, errors } — lenient: logs warnings but doesn't reject. */
export function validateRollOrder(rolls: ActionRoll[], pool: RolledSection[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const bySection: Record<string, ActionRoll[]> = {}

  for (const roll of rolls) {
    if (!bySection[roll.section]) bySection[roll.section] = []
    bySection[roll.section].push(roll)
  }

  for (const [sectionName, sectionRolls] of Object.entries(bySection)) {
    const poolSection = pool.find((s) => s.name === sectionName)
    if (!poolSection) {
      errors.push(`Section "${sectionName}" not found in dice pool`)
      continue
    }
    let expected = 1
    for (const roll of sectionRolls) {
      if (roll.dieIndex !== expected) {
        errors.push(`Section "${sectionName}": expected die_used=${expected}, got ${roll.dieIndex}`)
      }
      if (roll.dieIndex > poolSection.dice.length) {
        errors.push(`Section "${sectionName}": die_used=${roll.dieIndex} exceeds available dice (${poolSection.dice.length})`)
      }
      expected = roll.dieIndex + 1
    }
  }
  return { valid: errors.length === 0, errors }
}

/** Compute the result of a single roll: look up die value, compute modifier, determine success/failure. */
export function computeRollResult(roll: ActionRoll, sheetXml: string, pool: RolledSection[]): ActionRoll {
  const section = pool.find((s) => s.name === roll.section)
  if (section) {
    const die = section.dice.find((d) => d.index === roll.dieIndex)
    if (die) {
      roll.dieValue = die.value
    } else {
      spindle.log.warn(`Dice: die #${roll.dieIndex} not found in section "${roll.section}"`)
    }
  } else {
    spindle.log.warn(`Dice: section "${roll.section}" not found in pool`)
  }

  // Compute modifier if attribute system is enabled and attribute is specified
  if (engineToggles.attributeSystem && roll.attribute) {
    const attrValue = getAttribute(sheetXml, roll.attribute)
    if (attrValue > 0) {
      roll.modifier = Math.floor((attrValue - 10) / 2)
    }
  }

  roll.total = roll.dieValue + roll.modifier

  if (roll.dc > 0) {
    roll.result = roll.total >= roll.dc ? 'success' : 'failure'
  } else {
    roll.result = 'narrative'
  }

  return roll
}

/** Orchestrate full action-roll processing: parse → validate → compute → toast → strip tags.
 *  Returns the cleaned content (with <action_roll> tags removed).
 *  Async because chat variable get/delete are async RPC calls. */
export async function processActionRolls(
  sheetXml: string,
  chatId: string,
  content: string,
  getChatVar: (chatId: string, key: string) => Promise<string | null>,
  deleteChatVar: (chatId: string, key: string) => Promise<void>,
): Promise<string> {
  const stateJson = await getChatVar(chatId, 'dicePoolState')
  if (!stateJson) return content

  let pool: RolledSection[]
  try {
    pool = JSON.parse(stateJson)
  } catch {
    spindle.log.warn('Dice: failed to parse dicePoolState chat variable')
    await deleteChatVar(chatId, 'dicePoolState')
    return content
  }

  const rolls = parseActionRolls(content)
  if (rolls.length === 0) {
    // No rolls used — silently discard
    await deleteChatVar(chatId, 'dicePoolState')
    return content
  }

  const validation = validateRollOrder(rolls, pool)
  if (!validation.valid) {
    for (const err of validation.errors) {
      spindle.log.warn(`Dice validation: ${err}`)
    }
  }

  for (const roll of rolls) {
    computeRollResult(roll, sheetXml, pool)

    // Send toast notification
    const modStr = roll.modifier !== 0 ? ` ${roll.modifier > 0 ? '+' : ''}${roll.modifier}` : ''
    if (roll.result === 'success') {
      maybeToast('dice', 'success', `🎲 [${roll.section}] ${roll.type}: ${roll.dieValue}${modStr} = ${roll.total} vs DC ${roll.dc} → Success!`)
    } else if (roll.result === 'failure') {
      maybeToast('dice', 'warning', `🎲 [${roll.section}] ${roll.type}: ${roll.dieValue}${modStr} = ${roll.total} vs DC ${roll.dc} → Failure`)
    } else {
      maybeToast('dice', 'info', `🎲 [${roll.section}] ${roll.type}: ${roll.dieValue}`)
    }
  }

  // Strip <action_roll> tags from content
  const cleanedContent = content.replace(/<action_roll\s+[^>]*?\/>/gi, '')

  // Clean up chat variable
  await deleteChatVar(chatId, 'dicePoolState')

  return cleanedContent
}
