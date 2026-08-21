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

// ─── Clothing Condition System ────────────────────────────────

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

  const thresholds =
    conditionThresholds[elasticity] || conditionThresholds.standard

  let newCondition = 'intact'
  for (let i = 0; i < thresholds.length; i++) {
    if (stress >= thresholds[i]) {
      newCondition = conditionNames[i]
    }
  }

  if (
    lockedCondition === 'damaged' ||
    lockedCondition === 'ruined'
  ) {
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
): { xml: string; damageEvents: string[] } {
  const damageEvents: string[] = []

  const getMode = (x: string) => {
    const m = x.match(/<ClothingMode>(.*?)<\/ClothingMode>/i)
    return (m && m[1].trim().toLowerCase()) || 'flavor'
  }

  const oldMode = getMode(oldXml)
  const newMode = getMode(xml)

  // If mode changed, wipe all clothing stress/condition
  if (oldMode !== newMode) {
    spindle.log.info(
      `Clothing mode changed: ${oldMode} → ${newMode}, wiping stress/condition`,
    )
    xml = xml.replace(/<Equip\s+([^>]*?)>/gi, (match, attrs) => {
      let cleanAttrs = attrs
        .replace(/\s+stress="[^"]*"/gi, '')
        .replace(/\s+condition="[^"]*"/gi, '')
      return `<Equip ${cleanAttrs.trim()}>`
    })
    if (newMode !== 'hardcore') return { xml, damageEvents }
  }

  // If not hardcore mode, don't process
  if (newMode !== 'hardcore') return { xml, damageEvents }

  // Calculate body stat deltas
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

  // Process each <Equip> tag (non-self-closing)
  xml = xml.replace(
    /<Equip\s+([^>]*?)>([\s\S]*?)<\/Equip>/gi,
    (match, attrs, inner) => {
      const slot = getAttrFromString(attrs, 'slot') || ''
      const elasticity =
        getAttrFromString(attrs, 'elasticity') || 'standard'

      if (elasticity === 'magic') {
        let cleanAttrs = attrs
          .replace(/\s+stress="[^"]*"/gi, '')
          .replace(/\s+condition="[^"]*"/gi, '')
        return `<Equip ${cleanAttrs.trim()}>${inner}</Equip>`
      }

      let stress =
        parseFloat(getAttrFromString(attrs, 'stress')) || 0
      const oldCondition =
        getAttrFromString(attrs, 'condition') || 'intact'

      const affectedParts = slotBodyMap[slot] || ['weight']

      let stressChange = 0
      for (const part of affectedParts) {
        const delta = deltas[part] || 0
        const mult = stressMultipliers[part] || 1
        stressChange += delta * mult
      }

      stress += stressChange
      stress = Math.max(0, stress)

      const thresholds =
        conditionThresholds[elasticity] ||
        conditionThresholds.standard
      if (
        oldCondition === 'damaged' ||
        oldCondition === 'ruined'
      ) {
        stress = Math.max(stress, thresholds[3])
      }

      const newCondition = deriveCondition(
        stress,
        elasticity,
        oldCondition,
      )

      if (newCondition !== oldCondition) {
        const isDamage = ['damaged', 'ruined'].includes(
          newCondition,
        )
        if (isDamage) {
          damageEvents.push(
            `${slot}: ${oldCondition}→${newCondition}`,
          )
        }
      }

      let cleanAttrs = attrs
        .replace(/\s+stress="[^"]*"/gi, '')
        .replace(/\s+condition="[^"]*"/gi, '')
        .trim()

      return `<Equip ${cleanAttrs} stress="${stress.toFixed(2)}" condition="${newCondition}">${inner}</Equip>`
    },
  )

  // Process self-closing <Equip ... /> tags
  xml = xml.replace(
    /<Equip\s+([^>]+?)\s*\/>/gi,
    (match, attrs) => {
      const slot = getAttrFromString(attrs, 'slot') || ''
      const elasticity =
        getAttrFromString(attrs, 'elasticity') || 'standard'

      if (elasticity === 'magic') {
        let cleanAttrs = attrs
          .replace(/\s+stress="[^"]*"/gi, '')
          .replace(/\s+condition="[^"]*"/gi, '')
        return `<Equip ${cleanAttrs.trim()} />`
      }

      let stress =
        parseFloat(getAttrFromString(attrs, 'stress')) || 0
      const oldCondition =
        getAttrFromString(attrs, 'condition') || 'intact'

      const affectedParts = slotBodyMap[slot] || ['weight']

      let stressChange = 0
      for (const part of affectedParts) {
        const delta = deltas[part] || 0
        const mult = stressMultipliers[part] || 1
        stressChange += delta * mult
      }

      stress += stressChange
      stress = Math.max(0, stress)

      const thresholds =
        conditionThresholds[elasticity] ||
        conditionThresholds.standard
      if (
        oldCondition === 'damaged' ||
        oldCondition === 'ruined'
      ) {
        stress = Math.max(stress, thresholds[3])
      }

      const newCondition = deriveCondition(
        stress,
        elasticity,
        oldCondition,
      )

      if (newCondition !== oldCondition) {
        if (['damaged', 'ruined'].includes(newCondition)) {
          damageEvents.push(
            `${slot}: ${oldCondition}→${newCondition}`,
          )
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

// ─── Digestion Engine ─────────────────────────────────────────

function runDigestionTick(
  newXml: string,
  oldXml: string,
): string {
  try {
    const getTimeHours = (xml: string) => {
      const match = xml.match(/<Time>(.*?)<\/Time>/i)
      if (!match) return null
      const timeStr = match[1].trim()
      const parts = timeStr.split(':').map(Number)
      if (
        parts.length === 2 &&
        !isNaN(parts[0]) &&
        !isNaN(parts[1])
      ) {
        return parts[0] + parts[1] / 60
      }
      const h = parseFloat(timeStr)
      return isNaN(h) ? null : h
    }

    const oldTime = getTimeHours(oldXml)
    const newTime = getTimeHours(newXml)

    if (oldTime === null || newTime === null) {
      spindle.log.info('Digestion tick skipped: missing time')
      // Still process clothing stress if body changed even without time
      const clothingResult = processClothingStress(newXml, oldXml)
      if (clothingResult.damageEvents.length > 0) {
        spindle.log.info(
          `Clothing damage: ${clothingResult.damageEvents.join(', ')}`,
        )
      }
      return clothingResult.xml
    }

    let elapsed = newTime - oldTime

    if (elapsed < 0) {
      // If the backward jump is more than 12 hours, it's a midnight crossing
      // (e.g., 22:00 → 03:00 = -19, add 24 = +5 hours)
      // If it's less than 12 hours, it's a rollback (e.g., 15:00 → 14:00)
      if (elapsed < -12) {
        elapsed += 24
        spindle.log.info(
          `Midnight crossing detected: elapsed adjusted to ${elapsed.toFixed(2)}h`,
        )
      } else {
        spindle.log.info(
          'Digestion tick skipped: time went backwards (rollback)',
        )
        return newXml
      }
    }

    if (elapsed === 0) {
      spindle.log.info('Digestion tick skipped: 0 hours elapsed')
      // Even with 0 time, process clothing stress if body changed
      const clothingResult = processClothingStress(newXml, oldXml)
      if (clothingResult.damageEvents.length > 0) {
        spindle.log.info(
          `Clothing damage: ${clothingResult.damageEvents.join(', ')}`,
        )
      }
      return clothingResult.xml
    }

    let acidLevel = getStat(newXml, 'CurrentAcidPct')
    const baseDigRate = getStat(newXml, 'BaseDigestionRate') || 25
    const acidRiseRate = getStat(newXml, 'AcidRiseRate') || 10

    const stomachMatch = newXml.match(
      /<Stomach[\s\S]*?>([\s\S]*?)<\/Stomach>/i,
    )
    const stomachContents = stomachMatch
      ? stomachMatch[1].trim()
      : ''
    const hasItems = stomachContents.includes('<Item')

    if (hasItems) {
      acidLevel = Math.min(100, acidLevel + acidRiseRate * elapsed)
    } else {
      acidLevel = Math.max(0, acidLevel - acidRiseRate * elapsed)
    }

    const acidMultiplier = 1 + acidLevel / 100

    let updatedXml = newXml.replace(
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

    // ─── Extract Stomach and Bowels ──────────────────────────
    const stomMatch = updatedXml.match(
      /<Stomach([^>]*)>([\s\S]*?)<\/Stomach>/i,
    )
    const bowMatch = updatedXml.match(
      /<Bowels([^>]*)>([\s\S]*?)<\/Bowels>/i,
    )

    let stomContent = stomMatch ? stomMatch[2].trim() : ''
    let bowContent = bowMatch ? bowMatch[2].trim() : ''
    let itemCount = 0
    let wasteCount = 0
    let accumulatedWasteVol = 0
    let totalDigestedVol = 0

    // Pass 1: Normal tags <Item ...>...</Item>
    // [^>]*[^>\/] ensures we don't accidentally match self-closing tags
    const itemRegex1 = /<Item\s+([^>]*[^>\/])\s*>([\s\S]*?)<\/Item>/gi
    stomContent = stomContent.replace(
      itemRegex1,
      (match, attrs, inner) => {
        itemCount++
        const type = getAttrFromString(attrs, 'type') || 'Food'
        const name = getAttrFromString(attrs, 'name')
        const vol = getAttrFromString(attrs, 'volume_L')

        let speedMult = 1
        if (type === 'Liquid') speedMult = 3
        else if (type === 'Prey') speedMult = 0.5

        let digNum =
          parseFloat(
            getAttrFromString(attrs, 'digestion').replace('%', ''),
          ) || 0
        const digIncrease =
          baseDigRate * speedMult * acidMultiplier * elapsed
        digNum = Math.min(100, digNum + digIncrease)

        if (digNum >= 100) {
          const numVol = parseFloat(vol) || 0
          totalDigestedVol += numVol

          if (type === 'Prey') {
            let remVol = numVol * 0.3
            let remName = `Skeleton of ${name}`
            const gearMatch = inner.match(
              /<BoundGear>([\s\S]*?)<\/BoundGear>/i,
            )
            const gear = gearMatch ? gearMatch[1].trim() : ''
            if (gear) remName += `, ${gear}`
            bowContent += `\n      <Remains volume_L="${remVol.toFixed(2)}">${remName}</Remains>`
            wasteCount++
          } else {
            accumulatedWasteVol += numVol * 0.2
          }
          return ''
        }

        return `<Item type="${type}" name="${name}" volume_L="${vol}" digestion="${digNum.toFixed(2)}%">${inner}</Item>`
      },
    )

    // Pass 2: Self-closing tags <Item ... />
    const itemRegex2 = /<Item\s+([^>]+?)\s*\/>/gi
    stomContent = stomContent.replace(
      itemRegex2,
      (match, attrs) => {
        itemCount++
        const type = getAttrFromString(attrs, 'type') || 'Food'
        const name = getAttrFromString(attrs, 'name')
        const vol = getAttrFromString(attrs, 'volume_L')

        let speedMult = 1
        if (type === 'Liquid') speedMult = 3
        else if (type === 'Prey') speedMult = 0.5

        let digNum =
          parseFloat(
            getAttrFromString(attrs, 'digestion').replace('%', ''),
          ) || 0
        const digIncrease =
          baseDigRate * speedMult * acidMultiplier * elapsed
        digNum = Math.min(100, digNum + digIncrease)

        if (digNum >= 100) {
          const numVol = parseFloat(vol) || 0
          totalDigestedVol += numVol

          if (type === 'Prey') {
            let remVol = numVol * 0.3
            let remName = `Skeleton of ${name}`
            bowContent += `\n      <Remains volume_L="${remVol.toFixed(2)}">${remName}</Remains>`
            wasteCount++
          } else {
            accumulatedWasteVol += numVol * 0.2
          }
          return ''
        }

        return `<Item type="${type}" name="${name}" volume_L="${vol}" digestion="${digNum.toFixed(2)}%" />`
      },
    )

    // ─── Process accumulated waste ───────────────────────────
    if (accumulatedWasteVol > 0) {
      wasteCount++
      const wasteRegex =
        /<Remains volume_L="([^"]+)">Digestive Waste<\/Remains>/i
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

    // Clean up empty lines
    stomContent = stomContent.replace(/^\s*\n/gm, '').trim()
    bowContent = bowContent.trim()

    // Rebuild Stomach and Bowels
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

    // ─── Nutrient Absorption (Growth) ────────────────────────
    if (totalDigestedVol > 0) {
      const heightGrowth = totalDigestedVol * 0.035
      const weightGrowth = totalDigestedVol * 0.035
      const breastGrowth = totalDigestedVol * 1.0
      const hipsGrowth = totalDigestedVol * 0.035
      const penisLGrowth = totalDigestedVol * 0.014
      const penisGGrowth = totalDigestedVol * 0.004

      let height = getStat(updatedXml, 'Height_cm') || 160
      let weight = getStat(updatedXml, 'Weight_kg') || 60
      let breastVol = getStat(updatedXml, 'BreastVolume_ml') || 0
      let hips = getStat(updatedXml, 'Hips_cm') || 90
      let penisL = getStat(updatedXml, 'PenisLength_cm') || 0
      let penisG = getStat(updatedXml, 'PenisGirth_cm') || 0

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

      spindle.log.info(
        `Nutrient absorption: +${heightGrowth.toFixed(2)}cm height, ` +
          `+${weightGrowth.toFixed(2)}kg weight, ` +
          `+${breastGrowth.toFixed(2)}ml breasts, ` +
          `+${hipsGrowth.toFixed(2)}cm hips, ` +
          `+${penisLGrowth.toFixed(2)}cm penis L, ` +
          `+${penisGGrowth.toFixed(2)}cm penis G`,
      )
    }

    // ─── Clothing Stress Processing ──────────────────────────
    const clothingResult = processClothingStress(updatedXml, oldXml)
    updatedXml = clothingResult.xml

    if (clothingResult.damageEvents.length > 0) {
      spindle.log.info(
        `Clothing damage: ${clothingResult.damageEvents.join(', ')}`,
      )
    }

    spindle.log.info(
      `Digestion tick: ${elapsed.toFixed(2)}h elapsed, ` +
        `acid ${acidLevel.toFixed(1)}%, ${itemCount} items processed, ` +
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
  const finalXml = runDigestionTick(sheetXml, oldSheet)

  await saveChatSheet(chatId, finalXml)
  const list = snapshots.get(chatId) || []
  list.push({ messageId, sheetXml: finalXml, chatIndex })
  snapshots.set(chatId, list)
  await saveChatSnapshots(chatId)

  if (chatId === activeChatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: finalXml })
  }
  spindle.log.info(
    `Sheet committed for message ${messageId} in chat ${chatId}`,
  )
}

async function rollbackOnDelete(chatId: string, messageId: string) {
  const list = snapshots.get(chatId)
  if (!list) {
    spindle.toast.warning('Rollback: no snapshot list found')
    return
  }

  const hadSnapshot = list.some((s) => s.messageId === messageId)
  const newList = list.filter((s) => s.messageId !== messageId)
  snapshots.set(chatId, newList)
  committedMessageIds.delete(messageId)

  if (!hadSnapshot) {
    spindle.toast.warning('Rollback: deleted message had no snapshot')
    return
  }

  spindle.toast.info('Rollback: restoring previous sheet state...')

  if (newList.length > 0) {
    const latest = newList.reduce((a, b) =>
      a.chatIndex > b.chatIndex ? a : b,
    )
    await saveChatSheet(chatId, latest.sheetXml)
    if (chatId === activeChatId) {
      spindle.sendToFrontend({
        type: 'SHEET_UPDATED',
        xml: latest.sheetXml,
      })
    }
    spindle.toast.success('Rollback: restored previous sheet')
  } else {
    await saveChatSheet(chatId, '')
    if (chatId === activeChatId) {
      spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: '' })
    }
    spindle.toast.success('Rollback: cleared sheet')
  }

  await saveChatSnapshots(chatId)
  spindle.log.info(
    `Rolled back in chat ${chatId} after deletion of ${messageId}`,
  )
}

function buildSheetPrompt(sheetXml: string): string {
  return `[CHARACTER SHEET SYSTEM

You are operating with a persistent character sheet tracker. Below is the current state of the character sheet. You must stay aware of these values and act consistently with them.

<CurrentCharacterSheet>
${sheetXml}
</CurrentCharacterSheet>

─── UPDATE INSTRUCTIONS ───

When the character sheet changes during the scene, you MUST include an updated copy of the FULL sheet inside a <sheet_update> block at the very END of your response.

CRITICAL XML RULES:
1. You MUST copy the EXACT XML structure provided in <CurrentCharacterSheet>. Do NOT invent new tags, do NOT change tag names, do NOT change attributes.
2. Clothing MUST be inside <Clothing> using the <Equip slot="..." elasticity="...">...</Equip> format.
   VALID SLOT NAMES ONLY: "Head Top", "Face", "Head Lower", "Neck", "Underwear Top", "Underwear Bottom", "Torso Base", "Torso Mid", "Torso Outer", "Torso Shell", "Hands Base", "Hands Outer", "Legs Base", "Legs Outer", "Feet Base", "Feet Outer", "Jewelry", "Back", "Waist".
3. The <Equip> tag MUST ALWAYS have an elasticity attribute. Valid values are "rigid", "standard", "stretchy", or "magic". Never omit it. If the extension has added stress="..." or condition="..." attributes to an Equip tag, copy them exactly as-is. Do NOT modify or remove them.
4. Stomach contents MUST be inside <Stomach> using the <Item type="Liquid|Food|Prey" name="..." volume_L="..." digestion="...%"> format. Do not use a <Prey> tag.
5. Prey gear/flavor MUST go inside <Description> and <BoundGear> tags within the <Item type="Prey"> tag.
6. DO NOT calculate digestion percentages yourself. The extension's Metabolic Engine handles all digestion math automatically based on the <Time> you set. You only need to add items to the stomach when eaten, and update the <Time> tag.
7. If prey is fully digested (reaches 100%), the extension will AUTOMATICALLY move their remains to the Bowels section. You do NOT need to move the remains yourself. Just let the item disappear from <Stomach> in your next update if it was fully digested, and the extension will handle the transfer to <Bowels>.
8. The extension AUTOMATICALLY handles nutrient absorption and body growth. When items are digested, the character's Height, Weight, BreastVolume, Hips, and Penis dimensions will increase proportionally. Do NOT manually adjust these stats based on digestion — the extension does it for you. Only adjust them if something else changes them (e.g. magic, transformation).
9. The extension AUTOMATICALLY handles clothing stress and condition in "hardcore" mode. Clothes degrade as the body grows: intact → snug → strained → tight → damaged → ruined. Once "damaged" or "ruined", the condition is permanent. In "flavor" mode, clothes never degrade. You can narrate clothing straining or tearing based on the condition values you see in the sheet, but do NOT change the stress or condition attributes yourself.
10. ABSOLUTE SOURCE OF TRUTH: The <CurrentCharacterSheet> provided above is the absolute source of truth. You MUST copy the values from it exactly, especially <ClothingMode>. If it says "hardcore", you MUST output "hardcore". Do NOT copy values from previous messages or your memory. Always look at the provided sheet first.
11. The <sheet_update> block is invisible to the user — do not mention it in your visible text.
12. If absolutely nothing on the sheet changed, you may omit the block.
13. Always include all sections (State, BaseStats, Clothing, Backpack, SkillsAndTraits, DigestiveTract) even if some are empty.

<sheet_update>
<CharacterSheet>
  ...the complete updated sheet with ALL fields, not just changed ones...
</CharacterSheet>
</sheet_update>]`
}

spindle.onFrontendMessage(async (msg: any) => {
  if (msg.type === 'SYNC_BIO_DATA' && msg.xmlData) {
    if (!activeChatId) {
      spindle.toast.warning('Open a chat first before syncing the sheet.')
      return
    }
    await saveChatSheet(activeChatId, msg.xmlData)
    spindle.log.info(
      `Sheet synced from frontend for chat ${activeChatId}`,
    )
    spindle.toast.success('Character sheet synced!')
  }

  if (msg.type === 'GET_LATEST_SHEET') {
    if (!activeChatId) {
      spindle.toast.warning('Open a chat first.')
      return
    }
    const sheet = sheets.get(activeChatId) || ''
    spindle.sendToFrontend({ type: 'LATEST_SHEET', xml: sheet })
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

  if (genType === 'normal') {
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
        await commitUpdate(
          chatId,
          lastAssistant.sourceMessageId,
          update,
          chatIndex,
        )
        committedMessageIds.add(lastAssistant.sourceMessageId)
        sheet = sheets.get(chatId) || sheet
      }
    }
  }

  const injection = {
    role: 'system' as const,
    content: buildSheetPrompt(sheet),
  }

  return {
    messages: [injection, ...messages],
    breakdown: [{ messageIndex: 0, name: 'Character Sheet' }],
  }
}, 50)

spindle.on('GENERATION_ENDED', async (payload: any) => {
  if (payload.error) return

  const { chatId, messageId, content } = payload
  if (!chatId || !messageId || !content) return
  if (chatId !== activeChatId) return
  if (
    pendingGenerationType === 'swipe' ||
    pendingGenerationType === 'regenerate'
  ) {
    return
  }
  if (committedMessageIds.has(messageId)) return

  const update = extractSheetUpdate(content)
  if (!update) return

  const list = snapshots.get(chatId) || []
  const chatIndex = list.length
  await commitUpdate(chatId, messageId, update, chatIndex)
  committedMessageIds.add(messageId)

  spindle.toast.success('Sheet updated — digestion tick applied')
})

spindle.on('CHAT_SWITCHED', async (payload: any) => {
  await switchToChat(payload.chatId)
})

spindle.on('MESSAGE_DELETED', async (payload: any) => {
  const { chatId, messageId } = payload
  if (chatId) await rollbackOnDelete(chatId, messageId)
})

spindle.log.info('Bio Tracker backend loaded (Digestion Engine v8)')
