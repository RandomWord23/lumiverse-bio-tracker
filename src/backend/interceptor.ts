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
  // Hoist updatedXml outside the try block so the catch can return the
  // last successfully-processed XML instead of the raw LLM output.
  // This prevents a late-stage error (e.g. in arousalClimax or
  // nutrientAbsorption) from discarding indigestion/struggle values
  // that processStruggle already computed and wrote.
  let updatedXml: string = newXml
  try {
    const getTimeHours = (xml: string) => {
      const match = xml.match(/<Time>(.*?)<\/Time>/i)
      if (!match) return null
      const timeStr = match[1].trim()
      // The LLM sometimes prefixes the time with a day/date label
      // (e.g. "Day 1, 10:23"). Extract the LAST HH:MM pattern so we
      // ignore any leading prose and still get a valid hour value.
      const hmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(?:[ap]\.?m\.?)?$/i)
      if (hmMatch) {
        let h = parseInt(hmMatch[1], 10)
        const m = parseInt(hmMatch[2], 10)
        const ampm = hmMatch[3]
        if (ampm) {
          const isPm = /p/i.test(ampm)
          if (isPm && h < 12) h += 12
          if (!isPm && h === 12) h = 0
        }
        return h + m / 60
      }
      // Fallback: bare decimal hour (e.g. "14.5")
      const h = parseFloat(timeStr)
      return isNaN(h) ? null : h
    }

    let oldTime = getTimeHours(oldXml)
    let newTime = getTimeHours(newXml)

    // Bug fix: if the LLM omitted <Time> from its <sheet_update>, carry the
    // previous time forward instead of dropping it. Otherwise the stored
    // sheet loses its time reference and every future tick is skipped
    // ("extension forgot the time" loop).
    if (newTime === null && oldTime !== null) {
      const oldTimeTag = oldXml.match(/<Time>(.*?)<\/Time>/i)
      if (oldTimeTag) {
        newXml = newXml.replace(
          /<Time>.*?<\/Time>/i,
          `<Time>${oldTimeTag[1]}</Time>`,
        )
        if (!/<Time>/i.test(newXml)) {
          // No <Time> tag at all in the new sheet — inject one.
          newXml = newXml.includes('<BaseStats>')
            ? newXml.replace(/<BaseStats>/i, `<BaseStats>\n    <Time>${oldTimeTag[1]}</Time>`)
            : `<Time>${oldTimeTag[1]}</Time>\n${newXml}`
        }
        newTime = oldTime
        spindle.log.info(`LLM omitted <Time>; carried forward previous time ${oldTimeTag[1].trim()}`)
      }
    }
    // Symmetric case: old sheet lost its time earlier (legacy/manual sync) —
    // adopt the new time so the reference is re-established.
    if (oldTime === null && newTime !== null) {
      oldTime = newTime
      spindle.log.info('Old sheet had no <Time>; re-established time reference from new sheet')
    }

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

    updatedXml = newXml
    // Unified modifier pipeline: collects buffs + attributes (+ future sources),
    // sums them additively per stat key, and clamps to ±50%.
    const modifiers = collectModifiers(oldXml)
    let totalDigestedVol = 0
    let wasteCount = 0
    let totalItemCount = 0
    let acidLevel = 0

    if (engineToggles.digestionEngine) {
      // ── ABSOLUTE / TIMESTAMP-BASED MODEL ──────────────────────────────
      // All digestion state is stored as absolute timestamps on a monotonic
      // clock (<ElapsedHours>, summed from every tick's time delta). This
      // makes the system self-healing: if a tick is skipped, crashes, or is
      // rolled back, the next tick simply recomputes everything from the
      // timestamps. No accumulators, no drift, no "lost time" bugs.
      const baseDigRate = (getStat(oldXml, 'BaseDigestionRate') || 25) * (1 + (modifiers.BaseDigestionRate || 0))
    const acidRiseRate = (getStat(oldXml, 'AcidRiseRate') || 10) * (1 + (modifiers.AcidRiseRate || 0))

    // Monotonic clock: total hours elapsed since the RP started.
    const newElapsed = getStat(oldXml, 'ElapsedHours') + elapsed

    // Acid is a pure function of two timestamps:
    //   <FirstItemTime>     — when the current batch of items first appeared (0 = no batch)
    //   <StomachEmptyTime>  — when the stomach last became empty (0 = not emptied since batch)
    // Items present:  acid = min(100, riseRate * (now - firstItemTime))
    // Just emptied:   acid decays at the same rate from its peak:
    //                 acid = max(0, riseRate * (2*emptyTime - firstItemTime - now))
    let firstItemTime = getStat(oldXml, 'FirstItemTime')
    let stomachEmptyTime = getStat(oldXml, 'StomachEmptyTime')

    const stomachMatch = newXml.match(/<Stomach[\s\S]*?>([\s\S]*?)<\/Stomach>/i)
    const stomachContents = stomachMatch ? stomachMatch[1].trim() : ''
    const hasItems = stomachContents.includes('<Item')

    if (hasItems) {
      if (firstItemTime <= 0) {
        // A new batch of items appeared — start the acid ramp-up.
        firstItemTime = newElapsed
        stomachEmptyTime = 0
      }
      acidLevel = Math.min(100, acidRiseRate * Math.max(0, newElapsed - firstItemTime))
    } else if (firstItemTime > 0) {
      // Stomach just emptied (or is empty after a batch) — acid decays.
      if (stomachEmptyTime <= 0) {
        stomachEmptyTime = newElapsed
      }
      acidLevel = Math.max(0, acidRiseRate * (2 * stomachEmptyTime - firstItemTime - newElapsed))
      if (acidLevel <= 0) {
        // Fully decayed — reset the batch so the next item starts fresh.
        firstItemTime = 0
        stomachEmptyTime = 0
      }
    } else {
      acidLevel = 0
    }

    const acidMultiplier = 1 + acidLevel / 100

    updatedXml = setStat(updatedXml, 'ElapsedHours', newElapsed)
    updatedXml = setStat(updatedXml, 'FirstItemTime', firstItemTime)
    updatedXml = setStat(updatedXml, 'StomachEmptyTime', stomachEmptyTime)
    updatedXml = setStat(updatedXml, 'CurrentAcidPct', acidLevel)

    // Build a map of item name -> digestion % from the old (stored) sheet
    // so we can prevent the LLM from accidentally rolling back digestion values.
    // IMPORTANT: Only scan Stomach and Bowels sections — Backpack items use a
    // different format (no digestion attribute) and including them would cause
    // name collisions and incorrect clamping.
    const oldDigestionMap = new Map<string, number>()
    const oldStomMatch = oldXml.match(/<Stomach[^>]*>([\s\S]*?)<\/Stomach>/i)
    const oldBowMatch = oldXml.match(/<Bowels[^>]*>([\s\S]*?)<\/Bowels>/i)
    const oldDigestiveContent = [
      oldStomMatch ? oldStomMatch[1] : '',
      oldBowMatch ? oldBowMatch[1] : '',
    ].join('\n')
    const oldItemRegex = /<Item\s+([^>]+?)[\s/]*>/gi
    let oldItemMatch: RegExpExecArray | null
    while ((oldItemMatch = oldItemRegex.exec(oldDigestiveContent)) !== null) {
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
      currentElapsed: newElapsed,
      oldDigestionMap,
    })
    stomContent = stomResult.content

    const bowResult = digestItemsInContent(bowContent, {
      baseDigRate,
      acidMultiplier,
      currentElapsed: newElapsed,
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

    // Normalize Backpack items: strip digestion/type/volume_L attributes that
    // the LLM may have erroneously added. Backpack items use the simple
    // <Item qty="...">name</Item> format — they are NOT prey and should never
    // have a digestion meter. This prevents the UI from breaking (frontend
    // parser reads textContent as the item name, so <Item name="Waterskin"
    // digestion="14.06%">Full</Item> would display as "Full" instead of
    // "Waterskin"). This runs regardless of the digestionEngine toggle since
    // it is a format-correction step, not a digestion calculation.
    updatedXml = updatedXml.replace(
      /<Backpack([^>]*)>([\s\S]*?)<\/Backpack>/gi,
      (match, attrs, inner) => {
        const normalizedInner = inner.replace(
          /<Item\s+([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/Item>)/gi,
          (itemMatch: string, itemAttrs: string, textContent: string | undefined) => {
            const qty = getAttrFromString(itemAttrs, 'qty') || '1'
            const name = getAttrFromString(itemAttrs, 'name') || (textContent || '').trim()
            return `<Item qty="${qty}">${name}</Item>`
          },
        )
        return `<Backpack${attrs}>${normalizedInner}</Backpack>`
      },
    )

    if (engineToggles.struggleEngine) {
      const struggleResult = processStruggle(updatedXml, oldXml, elapsed, modifiers.StomachResistance || 0, modifiers.EnergyDrain || 0)
      updatedXml = struggleResult.xml
      // Verify indigestion survived into updatedXml after processStruggle
      const postStruggleInd = updatedXml.match(/<Stomach[^>]*\sindigestion="([^"]*)"/i)
      spindle.log.info(
        `[DigestionTick] After processStruggle: indigestion attr="${postStruggleInd ? postStruggleInd[1] : 'MISSING'}"`,
      )
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

    // Final verification: log indigestion in the XML being returned
    const finalInd = updatedXml.match(/<Stomach[^>]*\sindigestion="([^"]*)"/i)
    spindle.log.info(
      `[DigestionTick] RETURN: indigestion="${finalInd ? finalInd[1] : 'MISSING'}"`,
    )
    return updatedXml
  } catch (e) {
    spindle.log.error(`Digestion tick failed: ${e}`)
    // Return the last successfully-processed XML (which may include
    // indigestion/struggle values from processStruggle) instead of the
    // raw LLM output. This prevents a late-stage error from discarding
    // computed values that the user already saw toasts for.
    const catchInd = updatedXml.match(/<Stomach[^>]*\sindigestion="([^"]*)"/i)
    spindle.log.info(
      `[DigestionTick] CATCH RETURN: indigestion="${catchInd ? catchInd[1] : 'MISSING'}" ` +
        `(preserved from last successful step)`,
    )
    return updatedXml
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

  // Verify indigestion in the final XML before saving
  const commitInd = finalXml.match(/<Stomach[^>]*\sindigestion="([^"]*)"/i)
  spindle.log.info(
    `[commitUpdate] message ${messageId}: ` +
      `oldSheet indigestion="${(oldSheet.match(/<Stomach[^>]*\sindigestion="([^"]*)"/i) || [])[1] || 'MISSING'}", ` +
      `finalXml indigestion="${commitInd ? commitInd[1] : 'MISSING'}"`,
  )

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
          '\n\nThese events are for NARRATION ONLY — describe what happened in your visible text. The actual indigestion, stamina, and struggle VALUES are already in the <CurrentCharacterSheet> above. Copy those values exactly into your <sheet_update>. Do NOT use these notifications to override sheet values. If prey escaped during a vomit event, they have ALREADY been removed from the stored sheet — make sure your <sheet_update> does not include them in <Stomach>.'
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
