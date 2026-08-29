declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import {
  type Snapshot,
  sheets,
  snapshots,
  committedMessageIds,
  activeChatId,
  pendingGenerationType,
  setPendingGenerationType,
  toastSettings,
  setToastSettings,
  engineToggles,
  setEngineToggles,
} from './state'

import { processStruggle } from './struggle'

import {
  maybeToast,
  extractTextContent,
  extractSheetUpdate,
  findLastAssistantMessage,
  getAttrFromString,
  collectModifiers,
  getStat,
  setStat,
  processClothingStress,
  digestItemsInContent,
  buildSheetPrompt,
} from './engine'

import {
  loadChatSheet,
  saveChatSheet,
  saveChatSnapshots,
} from './storage'

export async function runDigestionTick(
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

export async function commitUpdate(
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

export async function rollbackOnDelete(chatId: string, messageId: string) {
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

/**
 * Prompt interceptor: injects the current character sheet into the prompt,
 * commits any pending sheet updates from the last assistant message, and
 * strips stale <sheet_update> blocks from chat history.
 */
export async function promptInterceptor(messages: any[], context: any) {
  const ctx = context as any
  const chatId: string = ctx.chatId
  const genType: string = ctx.generationType

  setPendingGenerationType(genType)

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
}
