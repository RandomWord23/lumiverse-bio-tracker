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
  promptSheets,
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
  clockDelta,
  buildSheetPrompt,
} from './engine'

import {
  loadChatSheet,
  saveChatSheet,
  saveChatSnapshots,
} from './storage'

import {
  type MessageContentProcessorCtx,
  type MessageContentProcessorResult,
} from './types'

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

    // ── DIAGNOSTIC: show time values on mobile ──────────────────────
    const oldTimeRaw = oldXml.match(/<Time>(.*?)<\/Time>/i)
    const newTimeRaw = newXml.match(/<Time>(.*?)<\/Time>/i)
    maybeToast(
      'digestionTicks',
      'info',
      `[DIAG] oldTime=${oldTime}h newTime=${newTime}h elapsed=${elapsed.toFixed(4)}h ` +
        `| oldRaw="${oldTimeRaw ? oldTimeRaw[1].trim() : 'NONE'}" ` +
        `newRaw="${newTimeRaw ? newTimeRaw[1].trim() : 'NONE'}"`,
    )
    spindle.log.info(
      `[DIAG] oldTime=${oldTime}h newTime=${newTime}h elapsed=${elapsed.toFixed(4)}h ` +
        `| oldRaw="${oldTimeRaw ? oldTimeRaw[1].trim() : 'NONE'}" ` +
        `newRaw="${newTimeRaw ? newTimeRaw[1].trim() : 'NONE'}"`,
    )

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

    maybeToast(
      'digestionTicks',
      'info',
      `[DIAG] digestionEngine=${engineToggles.digestionEngine} struggleEngine=${engineToggles.struggleEngine} ` +
        `| modifiers keys=${Object.keys(modifiers).join(',') || 'NONE'}`,
    )

    if (engineToggles.digestionEngine) {
      // ── ABSOLUTE / TIMESTAMP-BASED MODEL ──────────────────────────────
      // All digestion state is stored as absolute timestamps on the story
      // clock (decimal hours, 0-24 range, from <Time>). This makes the
      // system self-healing: if a tick is skipped, crashes, or is rolled
      // back, the next tick simply recomputes everything from the
      // timestamps. No accumulators, no drift, no "lost time" bugs.
      // Midnight wraparound is handled by clockDelta() in engine.ts.
      const baseDigRate = (getStat(oldXml, 'BaseDigestionRate') || 25) * (1 + (modifiers.BaseDigestionRate || 0))
    const acidRiseRate = (getStat(oldXml, 'AcidRiseRate') || 10) * (1 + (modifiers.AcidRiseRate || 0))

    // Story clock: the current <Time> value (decimal hours, 0-24).
    // oldTime / newTime are already parsed above; they are the story clock
    // timestamps used for all digestion calculations.
    const newClock = newTime
    const oldClock = oldTime

    // Acid is a pure function of two timestamps:
    //   <FirstItemTime>     — when the current batch of items first appeared (0 = no batch)
    //   <StomachEmptyTime>  — when the stomach last became empty (0 = not emptied since batch)
    // Items present:  acid = min(100, riseRate * clockDelta(now, firstItemTime))
    // Just emptied:   acid decays at the same rate from its peak:
    //                 acid = max(0, riseRate * (riseDuration - decayDuration))
    //                 where riseDuration  = clockDelta(emptyTime, firstItemTime)
    //                       decayDuration = clockDelta(now, emptyTime)
    let firstItemTime = getStat(oldXml, 'FirstItemTime')
    let stomachEmptyTime = getStat(oldXml, 'StomachEmptyTime')

    const stomachMatch = newXml.match(/<Stomach[\s\S]*?>([\s\S]*?)<\/Stomach>/i)
    const stomachContents = stomachMatch ? stomachMatch[1].trim() : ''
    const hasItems = stomachContents.includes('<Item')

    // Check if items existed in the old sheet too (for firstItemTime fallback)
    const oldStomachMatch = oldXml.match(/<Stomach[\s\S]*?>([\s\S]*?)<\/Stomach>/i)
    const oldStomachContents = oldStomachMatch ? oldStomachMatch[1].trim() : ''
    const oldHasItems = oldStomachContents.includes('<Item')

    if (hasItems) {
      if (firstItemTime <= 0) {
        // No firstItemTime recorded. If items existed in the old sheet,
        // they must have been present since at least the previous tick —
        // default to oldClock so acid doesn't compute to 0. Only use
        // newClock for truly new items (first appearance this tick).
        firstItemTime = oldHasItems ? oldClock : newClock
        stomachEmptyTime = 0
      }
      acidLevel = Math.min(100, acidRiseRate * clockDelta(newClock, firstItemTime))
    } else if (firstItemTime > 0) {
      // Stomach just emptied (or is empty after a batch) — acid decays.
      // Peak acid = riseRate * (emptyTime - firstItemTime), then decays at
      // the same rate for (now - emptyTime). Net = riseRate * (rise - decay).
      // clockDelta handles midnight wraparound on both legs.
      if (stomachEmptyTime <= 0) {
        stomachEmptyTime = newClock
      }
      const riseDuration = clockDelta(stomachEmptyTime, firstItemTime)
      const decayDuration = clockDelta(newClock, stomachEmptyTime)
      acidLevel = Math.max(0, acidRiseRate * (riseDuration - decayDuration))
      if (acidLevel <= 0) {
        // Fully decayed — reset the batch so the next item starts fresh.
        firstItemTime = 0
        stomachEmptyTime = 0
      }
    } else {
      acidLevel = 0
    }

    const acidMultiplier = 1 + acidLevel / 100

    updatedXml = setStat(updatedXml, 'FirstItemTime', firstItemTime)
    updatedXml = setStat(updatedXml, 'StomachEmptyTime', stomachEmptyTime)
    updatedXml = setStat(updatedXml, 'CurrentAcidPct', acidLevel)

    // Build maps of item name -> digestion % AND item name -> timeAdded from
    // the old (stored) sheet. The timeAdded map is critical: the LLM never
    // includes the engine-injected timeAdded attribute in its output, so
    // without this map every item would be treated as brand-new on every tick
    // (timeAdded = currentElapsed → digestion = rate × 0 = 0).
    // IMPORTANT: Only scan Stomach and Bowels sections — Backpack items use a
    // different format (no digestion attribute) and including them would cause
    // name collisions and incorrect clamping.
    const oldDigestionMap = new Map<string, number>()
    const oldTimeAddedMap = new Map<string, number>()
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
        const oldTimeAdded = parseFloat(getAttrFromString(oldAttrs, 'timeAdded'))
        if (!isNaN(oldTimeAdded) && oldTimeAdded > 0) {
          oldTimeAddedMap.set(oldName, oldTimeAdded)
        }
      }
    }
    spindle.log.info(
      `[DigestionTick] oldTimeAddedMap: ${oldTimeAddedMap.size} entries, ` +
        `oldDigestionMap: ${oldDigestionMap.size} entries`,
    )

    const stomMatch = updatedXml.match(/<Stomach([^>]*)>([\s\S]*?)<\/Stomach>/i)
    const bowMatch = updatedXml.match(/<Bowels([^>]*)>([\s\S]*?)<\/Bowels>/i)

    let stomContent = stomMatch ? stomMatch[2].trim() : ''
    let bowContent = bowMatch ? bowMatch[2].trim() : ''

    const stomResult = digestItemsInContent(stomContent, {
      baseDigRate,
      acidMultiplier,
      currentClock: newClock,
      oldClock,
      oldDigestionMap,
      oldTimeAddedMap,
    })
    stomContent = stomResult.content

    const bowResult = digestItemsInContent(bowContent, {
      baseDigRate,
      acidMultiplier,
      currentClock: newClock,
      oldClock,
      oldDigestionMap,
      oldTimeAddedMap,
    })
    bowContent = bowResult.content

    totalDigestedVol = stomResult.totalDigestedVol + bowResult.totalDigestedVol
    wasteCount = stomResult.wasteCount + bowResult.wasteCount
    const accumulatedWasteVol = stomResult.accumulatedWasteVol + bowResult.accumulatedWasteVol
    totalItemCount = stomResult.itemCount + bowResult.itemCount

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

    // ── DIAGNOSTIC: show computed digestion values after engine block ──
    const diagAcidMatch = updatedXml.match(/<CurrentAcidPct>(.*?)<\/CurrentAcidPct>/i)
    const diagStomItems = updatedXml.match(/<Stomach[^>]*>([\s\S]*?)<\/Stomach>/i)
    const diagItemDigestions: string[] = []
    if (diagStomItems) {
      const itemRegex = /<Item\s+[^>]*?name="([^"]*)"[^>]*?digestion="([^"]*)"/gi
      let m: RegExpExecArray | null
      while ((m = itemRegex.exec(diagStomItems[1])) !== null) {
        diagItemDigestions.push(`${m[1]}=${m[2]}`)
      }
    }
    maybeToast(
      'digestionTicks',
      'info',
      `[DIAG-postEngine] acid=${diagAcidMatch ? diagAcidMatch[1] : 'MISSING'} ` +
        `items=${totalItemCount} digestedVol=${totalDigestedVol.toFixed(2)}L ` +
        `| ${diagItemDigestions.join(', ') || 'NO ITEMS WITH DIGESTION'}`,
    )

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
      maybeToast(
        'digestionTicks',
        'info',
        `[DIAG-postStruggle] indigestion=${postStruggleInd ? postStruggleInd[1] : 'MISSING'} ` +
          `events=${struggleResult.struggleEvents.length}`,
      )
      spindle.log.info(
        `[DigestionTick] After processStruggle: indigestion attr="${postStruggleInd ? postStruggleInd[1] : 'MISSING'}"`,
      )
      if (struggleResult.struggleEvents.length > 0) {
        await spindle.variables.chat.set(
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
      const pendingOrgasmReset = await spindle.variables.chat.get(chatId, 'pendingOrgasmReset')
      if (pendingOrgasmReset === 'true') {
        finalArousal = 0
        finalClimax = 0
        await spindle.variables.chat.delete(chatId, 'pendingOrgasmReset')
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
          await spindle.variables.chat.set(chatId, 'pendingOrgasmReset', 'true')
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
    const finalAcid = updatedXml.match(/<CurrentAcidPct>(.*?)<\/CurrentAcidPct>/i)
    maybeToast(
      'digestionTicks',
      'info',
      `[DIAG-FINAL] acid=${finalAcid ? finalAcid[1] : 'MISSING'} ` +
        `indigestion=${finalInd ? finalInd[1] : 'MISSING'} ` +
        `items=${totalItemCount} digestedVol=${totalDigestedVol.toFixed(2)}L`,
    )
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
): Promise<string> {
  // ── Use the prompt-time sheet as "old" if available ──────────
  // promptSheets stores the exact sheet the LLM saw in the prompt.
  // This decouples us from the race condition where GENERATION_ENDED
  // might fire before the content processor — we always compute from
  // the pre-generation state, not the potentially-updated sheets Map.
  const promptSheet = promptSheets.get(chatId)
  const cachedSheet = sheets.get(chatId)
  const oldSheet = promptSheet ?? cachedSheet ?? ''
  const oldSheetTime = oldSheet.match(/<Time>(.*?)<\/Time>/i)
  const newSheetTime = sheetXml.match(/<Time>(.*?)<\/Time>/i)
  maybeToast(
    'digestionTicks',
    'info',
    `[DIAG-commit] source=${promptSheet ? 'promptSheets' : cachedSheet ? 'sheets' : 'EMPTY'} ` +
      `| oldTime="${oldSheetTime ? oldSheetTime[1].trim() : 'NONE'}" ` +
      `newTime="${newSheetTime ? newSheetTime[1].trim() : 'NONE'}" ` +
      `| oldSheetLen=${oldSheet.length}`,
  )
  spindle.log.info(
    `[DIAG-commit] source=${promptSheet ? 'promptSheets' : cachedSheet ? 'sheets' : 'EMPTY'} ` +
      `| oldTime="${oldSheetTime ? oldSheetTime[1].trim() : 'NONE'}" ` +
      `newTime="${newSheetTime ? newSheetTime[1].trim() : 'NONE'}"`,
  )
  const finalXml = await runDigestionTick(sheetXml, oldSheet, chatId)

  // Verify indigestion in the final XML before saving
  const commitInd = finalXml.match(/<Stomach[^>]*\sindigestion="([^"]*)"/i)
  spindle.log.info(
    `[commitUpdate] message ${messageId}: ` +
      `oldSheet indigestion="${(oldSheet.match(/<Stomach[^>]*\sindigestion="([^"]*)"/i) || [])[1] || 'MISSING'}", ` +
      `finalXml indigestion="${commitInd ? commitInd[1] : 'MISSING'}"`,
  )

  await saveChatSheet(chatId, finalXml)
  sheets.set(chatId, finalXml) // keep in-memory cache in sync
  const list = snapshots.get(chatId) || []
  list.push({ messageId, sheetXml: finalXml, chatIndex })
  snapshots.set(chatId, list)
  await saveChatSnapshots(chatId)

  if (chatId === activeChatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: finalXml })
  }
  spindle.log.info(`Sheet committed for message ${messageId} in chat ${chatId}`)

  return finalXml
}

/**
 * ── Tier 1: Message Content Processor ──────────────────────────────
 *
 * This is the PRIMARY processing path.  It runs BEFORE the message row
 * reaches the database (or the UI on first paint), so the values the user
 * sees in chat are the fully-computed t1 values, not the stale values the
 * LLM copied from the previous tick.
 *
 * Pipeline:
 *   promptInterceptor (inject sheet, store in promptSheets)
 *     → LLM generates <sheet_update> with stale copied values
 *       → contentProcessor (THIS)            ← run digestion tick here
 *         → DB write with computed values
 *           → GENERATION_ENDED (Tier 2 fallback + updateMessage rewrite)
 *
 * Origin handling:
 *   - "create"      → process (new assistant message)
 *   - "swipe_add"   → process (new swipe variant from LLM generation)
 *   - "swipe_update"→ process (swipe edit — may be LLM regeneration)
 *   - "update"      → SKIP (manual edit — respect user's text; updateMessage
 *                     fallback in GENERATION_ENDED handles LLM responses
 *                     saved via PUT /messages/:id)
 *   - "render"      → SKIP (display-only, non-persisting, fires twice)
 *
 * If this handler throws or times out (10 000 ms budget), Lumiverse passes
 * the un-mutated content forward.  Tier 2 (GENERATION_ENDED) then catches
 * it as a real fallback and rewrites the visible text via updateMessage.
 */
export async function contentProcessor(
  ctx: MessageContentProcessorCtx,
): Promise<MessageContentProcessorResult | void> {
  // ── Guard: skip display-only and manual-edit origins ────────────
  // "render" is display-only / non-persisting and fires twice per message.
  // "update" is a manual edit — respect the user's text.  The
  // updateMessage fallback in GENERATION_ENDED handles LLM responses
  // that Lumiverse saves via PUT /messages/:id (origin: "update").
  if (ctx.origin === 'render' || ctx.origin === 'update') return

  // ── Guard: only process messages that contain a sheet update ──────
  // User messages and system messages never contain <sheet_update>.
  // This is a cheap string check before any regex or async work.
  if (!ctx.content.includes('<sheet_update>')) return

  const chatId = ctx.chatId
  const update = extractSheetUpdate(ctx.content)
  if (!update) return

  maybeToast('digestionTicks', 'info', `[CP] Running (origin=${ctx.origin})`)

  // ── Load the "old" sheet — prefer the prompt-time snapshot ───────
  // promptSheets stores the exact sheet the LLM saw in the prompt.  This
  // decouples us from the race condition where GENERATION_ENDED might
  // fire before this processor and update sheets.get(chatId).
  const promptSheetCP = promptSheets.get(chatId)
  const cachedSheetCP = sheets.get(chatId)
  let oldSheet = promptSheetCP ?? cachedSheetCP
  if (oldSheet === undefined) {
    oldSheet = (await loadChatSheet(chatId)) || ''
  }
  const cpOldTime = oldSheet.match(/<Time>(.*?)<\/Time>/i)
  const cpNewTime = update.match(/<Time>(.*?)<\/Time>/i)
  maybeToast(
    'digestionTicks',
    'info',
    `[DIAG-cp] source=${promptSheetCP ? 'promptSheets' : cachedSheetCP ? 'sheets' : 'loaded'} ` +
      `| oldTime="${cpOldTime ? cpOldTime[1].trim() : 'NONE'}" ` +
      `newTime="${cpNewTime ? cpNewTime[1].trim() : 'NONE'}"`,
  )

  // ── Run the digestion tick (the real computation) ───────────────
  // This is the same function commitUpdate calls — it computes
  // indigestion, stamina, struggle, digestion %, acid, climax, nutrient
  // absorption, and clothing stress from the time-delta.
  const finalXml = await runDigestionTick(update, oldSheet, chatId)

  // ── Replace the <sheet_update> block in the message content ──────
  // The LLM's original block contained stale copied values.  We swap it
  // for the fully-computed XML so the persisted message is a self-
  // contained, accurate snapshot of the completed turn.
  const modifiedContent = ctx.content.replace(
    /<sheet_update>[\s\S]*?<\/sheet_update>/i,
    `<sheet_update>\n${finalXml}\n</sheet_update>`,
  )

  // ── Persist the computed sheet + update in-memory cache ──────────
  // This keeps sheets.get(chatId) in sync so the next promptInterceptor
  // sees the correct values.  If we skip this, the safety-net in
  // promptInterceptor would re-commit from the message text.
  await saveChatSheet(chatId, finalXml)
  sheets.set(chatId, finalXml)

  // ── Mark this message as committed ──────────────────────────────
  // Without this, if GENERATION_ENDED is skipped (e.g. chatId mismatch),
  // the promptInterceptor safety net re-commits the same message on the
  // next turn.  That re-commit uses the already-computed sheet as "old",
  // producing elapsed=0, which overwrites the computed values with the
  // LLM's raw (digestion=0%) output — corrupting the baseline for all
  // future turns.
  if (ctx.messageId) {
    committedMessageIds.add(ctx.messageId)
  }

  // ── Clean up the prompt-time snapshot ────────────────────────────
  promptSheets.delete(chatId)

  // ── Notify the frontend panel so the UI updates immediately ──────
  if (chatId === activeChatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: finalXml })
  }

  const indMatch = finalXml.match(/<Stomach[^>]*\sindigestion="([^"]*)"/i)
  const indValue = indMatch ? indMatch[1] : 'MISSING'
  spindle.log.info(
    `[contentProcessor] chat ${chatId} (origin=${ctx.origin}): ` +
      `computed indigestion="${indValue}", ` +
      `content replaced (len ${ctx.content.length} → ${modifiedContent.length})`,
  )
  maybeToast('digestionTicks', 'success', `[CP] indigestion=${indValue}, content replaced`)

  return { content: modifiedContent }
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

  const manualSyncPending = await spindle.variables.chat.get(chatId, 'manualSyncPending')
  if (manualSyncPending === 'true') {
    await spindle.variables.chat.delete(chatId, 'manualSyncPending')
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

  // ─── Store the prompt-time sheet snapshot ───────────────────
  // This is the exact sheet XML the LLM sees in its prompt.  The
  // contentProcessor and commitUpdate use it as the "old" sheet for
  // runDigestionTick, decoupling them from the race condition where
  // GENERATION_ENDED might update sheets.get(chatId) first.
  promptSheets.set(chatId, sheet)
  const promptTimeTag = sheet.match(/<Time>(.*?)<\/Time>/i)
  maybeToast(
    'digestionTicks',
    'info',
    `[DIAG-prompt] promptSheets.set | Time="${promptTimeTag ? promptTimeTag[1].trim() : 'NONE'}" | sheetLen=${sheet.length}`,
  )
  spindle.log.info(
    `[DIAG-prompt] promptSheets.set | Time="${promptTimeTag ? promptTimeTag[1].trim() : 'NONE'}"`,
  )

  let populateInstructions = ''
  const populateFields = await spindle.variables.chat.get(
    chatId,
    'populateFields',
  )
  if (populateFields) {
    await spindle.variables.chat.delete(chatId, 'populateFields')
    populateInstructions = `\n\n─── AUTO-POPULATE REQUEST ───\nThe user has requested that you populate ONLY the following blank fields with sensible, scene-appropriate defaults: ${populateFields}\nLeave ALL other fields exactly as they are.\nDo not advance the story or add new narrative events.\n\nCRITICAL FORMAT REMINDER: Your <sheet_update> block MUST contain FULL NESTED XML matching the structure of <CurrentCharacterSheet> — NOT flat "Key: Value" lines. The output MUST look like:\n<sheet_update>\n<CharacterSheet>\n  <State><Time>...</Time>...</State>\n  <BaseStats><Name>...</Name>...</BaseStats>\n  <Clothing>...</Clothing>\n  <Backpack>...</Backpack>\n  <SkillsAndTraits>...</SkillsAndTraits>\n  <DigestiveTract>...</DigestiveTract>\n</CharacterSheet>\n</sheet_update>\nCopy every tag and attribute from <CurrentCharacterSheet> exactly, filling in only the blank fields listed above. Output the COMPLETE sheet with ALL sections.`
  }

  let struggleNotification = ''
  const pendingStruggleEvents = await spindle.variables.chat.get(
    chatId,
    'pendingStruggleEvents',
  )
  if (pendingStruggleEvents) {
    await spindle.variables.chat.delete(chatId, 'pendingStruggleEvents')
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
