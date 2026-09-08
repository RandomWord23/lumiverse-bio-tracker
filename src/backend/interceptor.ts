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
  preGenerationSheets,
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
  getStatClock,
  setStatClock,
  clockToDecimal,
  processClothingStress,
  digestItemsInContent,
  transitItemsInContent,
  absorbItemsInContent,
  convertItemsInContent,
  clockDelta,
  buildSheetPrompt,
  parseDiceConfig,
  rollDicePool,
  buildDicePoolPrompt,
  processActionRolls,
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
    let wombAbsorbedVol = 0
    let wasteCount = 0
    let totalItemCount = 0
    let acidLevel = 0

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
    let firstItemTime = getStatClock(oldXml, 'FirstItemTime')
    let stomachEmptyTime = getStatClock(oldXml, 'StomachEmptyTime')

    const stomachMatch = newXml.match(/<Stomach(?![a-zA-Z])[\s\S]*?>([\s\S]*?)<\/Stomach>/i)
    const stomachContents = stomachMatch ? stomachMatch[1].trim() : ''
    const hasItems = stomachContents.includes('<Item')

    // Check if items existed in the old sheet too (for firstItemTime fallback)
    const oldStomachMatch = oldXml.match(/<Stomach(?![a-zA-Z])[\s\S]*?>([\s\S]*?)<\/Stomach>/i)
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

    updatedXml = setStatClock(updatedXml, 'FirstItemTime', firstItemTime)
    updatedXml = setStatClock(updatedXml, 'StomachEmptyTime', stomachEmptyTime)
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
    const oldStomMatch = oldXml.match(/<Stomach(?![a-zA-Z])[^>]*>([\s\S]*?)<\/Stomach>/i)
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
        const oldTimeAdded = clockToDecimal(getAttrFromString(oldAttrs, 'timeAdded'))
        if (!isNaN(oldTimeAdded) && oldTimeAdded > 0) {
          oldTimeAddedMap.set(oldName, oldTimeAdded)
        }
      }
    }
    const stomMatch = updatedXml.match(/<Stomach(?![a-zA-Z])([^>]*)>([\s\S]*?)<\/Stomach>/i)
    const bowMatch = updatedXml.match(/<Bowels([^>]*)>([\s\S]*?)<\/Bowels>/i)

    let stomContent = stomMatch ? stomMatch[2].trim() : ''
    let bowContent = bowMatch ? bowMatch[2].trim() : ''

    // ── DIAGNOSTIC: log bowels content BEFORE digestItemsInContent ──
    spindle.log.info(
      `[runDigestionTick] bowels BEFORE digest: ${bowContent.slice(0, 400)}`,
    )

    const stomResult = digestItemsInContent(stomContent, {
      baseDigRate,
      acidMultiplier,
      currentClock: newClock,
      oldClock,
      oldDigestionMap,
      oldTimeAddedMap,
    })
    stomContent = stomResult.content

    // Bowels prey TRANSIT (not digest). Only type="Prey" items transit;
    // Food/Liquid/Remains stay inert. At 100% transit, prey move to stomach.
    const baseTransitRate = baseDigRate * 2 // transit is always double digestion speed

    // Build oldTransitMap from old bowels prey (mirror oldDigestionMap).
    // Legacy chats may have digestion="X%" on bowels prey instead of transit;
    // in that case oldTransitMap.get(name) returns 0 and transit is computed
    // fresh from timeAdded (which IS in oldTimeAddedMap). See design doc
    // "Legacy Chat Migration" section.
    const oldTransitMap = new Map<string, number>()
    const oldBowMatch2 = oldXml.match(/<Bowels[^>]*>([\s\S]*?)<\/Bowels>/i)
    if (oldBowMatch2) {
      const oldBowRegex = /<Item\s+([^>]+?)[\s/]*>/gi
      let m: RegExpExecArray | null
      while ((m = oldBowRegex.exec(oldBowMatch2[1])) !== null) {
        const a = m[1]
        if ((getAttrFromString(a, 'type') || 'Food') === 'Prey') {
          const n = getAttrFromString(a, 'name')
          if (n) {
            const transitStr = getAttrFromString(a, 'transit')
            const transitVal = transitStr ? parseFloat(transitStr.replace('%', '')) || 0 : 0
            oldTransitMap.set(n, transitVal)
          }
        }
      }
    }

    const bowResult = transitItemsInContent(bowContent, {
      baseTransitRate,
      currentClock: newClock,
      oldClock,
      oldTransitMap,
      oldTimeAddedMap,
    })
    bowContent = bowResult.content

    // ── DIAGNOSTIC: log bowels content AFTER transitItemsInContent ──
    spindle.log.info(
      `[runDigestionTick] bowels AFTER transit: ${bowContent.slice(0, 400)}`,
    )

    // Transfer transit-complete prey into the stomach with fresh timeAdded.
    // Each transferred prey arrives with digestion="0%" and starts digesting
    // from the current clock — the full-tour arrival.
    if (bowResult.transferredToStomach.length > 0) {
      for (const item of bowResult.transferredToStomach) {
        stomContent += '\n      ' + item
      }
      maybeToast('digestionTicks', 'info', `🚶 ${bowResult.transferredToStomach.length} prey transited from bowels to stomach.`)
      spindle.log.info(`[runDigestionTick] TRANSIT: ${bowResult.transferredToStomach.length} prey moved bowels→stomach`)
    }

    // Bowels no longer digests — totals come only from the stomach result.
    // Transit does not produce waste or remains (prey arrives intact).
    totalDigestedVol = stomResult.totalDigestedVol
    wasteCount = stomResult.wasteCount
    const accumulatedWasteVol = stomResult.accumulatedWasteVol
    totalItemCount = stomResult.itemCount + bowResult.transitCount

    if (stomResult.newRemains.length > 0) {
      bowContent += '\n' + stomResult.newRemains.join('\n')
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
      /<Stomach(?![a-zA-Z])([^>]*)>[\s\S]*?<\/Stomach>/i,
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

    // ── WOMB ABSORPTION ──
    if (engineToggles.unbirthEngine) {
      const wombMatch = updatedXml.match(/<Womb[^>]*>([\s\S]*?)<\/Womb>/i)
      let wombContent = wombMatch ? wombMatch[1].trim() : ''

      if (wombContent) {
        const baseAbsorptionRate = baseDigRate * 0.5 // half digestion speed

        // Build oldAbsorptionMap from old womb prey
        const oldAbsorptionMap = new Map<string, number>()
        const oldWombMatch = oldXml.match(/<Womb[^>]*>([\s\S]*?)<\/Womb>/i)
        if (oldWombMatch) {
          const oldWombRegex = /<Item\s+([^>]+?)[\s/]*>/gi
          let m: RegExpExecArray | null
          while ((m = oldWombRegex.exec(oldWombMatch[1])) !== null) {
            const a = m[1]
            if ((getAttrFromString(a, 'type') || 'Food') === 'Prey') {
              const n = getAttrFromString(a, 'name')
              if (n) {
                const absStr = getAttrFromString(a, 'absorption')
                oldAbsorptionMap.set(n, absStr ? parseFloat(absStr.replace('%', '')) || 0 : 0)
              }
            }
          }
        }

        // Build oldStaminaMap from old womb prey
        const oldWombStaminaMap = new Map<string, number>()
        if (oldWombMatch) {
          const oldStamRegex = /<Item\s+([^>]+?)[\s/]*>/gi
          let m2: RegExpExecArray | null
          while ((m2 = oldStamRegex.exec(oldWombMatch[1])) !== null) {
            if ((getAttrFromString(m2[1], 'type') || 'Food') === 'Prey') {
              const n = getAttrFromString(m2[1], 'name')
              if (n) oldWombStaminaMap.set(n, parseFloat(getAttrFromString(m2[1], 'stamina') || '100') || 100)
            }
          }
        }

        const wombResult = absorbItemsInContent(wombContent, {
          baseAbsorptionRate,
          currentClock: newClock,
          oldClock,
          oldAbsorptionMap,
          oldTimeAddedMap,
          oldStaminaMap: oldWombStaminaMap,
        })
        wombContent = wombResult.content

        // Queue absorbed prey for nutrient absorption (same as stomach)
        if (wombResult.absorbedPrey.length > 0) {
          for (const prey of wombResult.absorbedPrey) {
            wombAbsorbedVol += prey.volume
          }
          maybeToast('digestionTicks', 'success', `🌸 ${wombResult.absorbedPrey.length} prey fully absorbed in the womb.`)
          spindle.log.info(`[runDigestionTick] WOMB: ${wombResult.absorbedPrey.length} prey absorbed, +${wombAbsorbedVol}L to nutrient pool`)
        }

        wombContent = wombContent.replace(/^\s*\n/gm, '').trim()
        updatedXml = updatedXml.replace(
          /<Womb([^>]*)>[\s\S]*?<\/Womb>/i,
          (match, attrs) => `<Womb${attrs}>\n${wombContent}\n    </Womb>`,
        )
      }
    } // end unbirthEngine

    // ── BALLS CONVERSION ──
    if (engineToggles.cockVoreEngine) {
      const ballsMatch = updatedXml.match(/<Balls[^>]*>([\s\S]*?)<\/Balls>/i)
      let ballsContent = ballsMatch ? ballsMatch[1].trim() : ''

      if (ballsContent) {
        const baseConversionRate = baseDigRate // same base as digestion, arousal modifies
        const currentArousal = getStat(updatedXml, 'Arousal') || 0

        // Build oldConversionMap from old balls prey
        const oldConversionMap = new Map<string, number>()
        const oldBallsMatch = oldXml.match(/<Balls[^>]*>([\s\S]*?)<\/Balls>/i)
        if (oldBallsMatch) {
          const oldBallsRegex = /<Item\s+([^>]+?)[\s/]*>/gi
          let m: RegExpExecArray | null
          while ((m = oldBallsRegex.exec(oldBallsMatch[1])) !== null) {
            const a = m[1]
            if ((getAttrFromString(a, 'type') || 'Food') === 'Prey') {
              const n = getAttrFromString(a, 'name')
              if (n) {
                const convStr = getAttrFromString(a, 'conversion')
                oldConversionMap.set(n, convStr ? parseFloat(convStr.replace('%', '')) || 0 : 0)
              }
            }
          }
        }

        // Build oldStaminaMap from old balls prey
        const oldBallsStaminaMap = new Map<string, number>()
        if (oldBallsMatch) {
          const oldStamRegex = /<Item\s+([^>]+?)[\s/]*>/gi
          let m2: RegExpExecArray | null
          while ((m2 = oldStamRegex.exec(oldBallsMatch[1])) !== null) {
            if ((getAttrFromString(m2[1], 'type') || 'Food') === 'Prey') {
              const n = getAttrFromString(m2[1], 'name')
              if (n) oldBallsStaminaMap.set(n, parseFloat(getAttrFromString(m2[1], 'stamina') || '100') || 100)
            }
          }
        }

        const ballsResult = convertItemsInContent(ballsContent, {
          baseConversionRate,
          arousal: currentArousal,
          currentClock: newClock,
          oldClock,
          oldConversionMap,
          oldTimeAddedMap,
          oldStaminaMap: oldBallsStaminaMap,
        })
        ballsContent = ballsResult.content

        // Add converted prey volume to CumVolume_ml
        if (ballsResult.convertedPrey.length > 0) {
          let convertedVol = 0
          for (const prey of ballsResult.convertedPrey) {
            convertedVol += prey.volume * 1000 // L → ml
          }
          const oldCumVol = getStat(updatedXml, 'CumVolume_ml') || 0
          updatedXml = setStat(updatedXml, 'CumVolume_ml', oldCumVol + convertedVol)
          maybeToast('digestionTicks', 'info', `💧 ${ballsResult.convertedPrey.length} prey converted in the balls.`)
          spindle.log.info(`[runDigestionTick] BALLS: ${ballsResult.convertedPrey.length} prey converted, +${convertedVol}ml cum`)
        }

        ballsContent = ballsContent.replace(/^\s*\n/gm, '').trim()
        updatedXml = updatedXml.replace(
          /<Balls([^>]*)>[\s\S]*?<\/Balls>/i,
          (match, attrs) => `<Balls${attrs}>\n${ballsContent}\n    </Balls>`,
        )
      }
    } // end cockVoreEngine

    } // end digestionEngine

    // Normalize Backpack items: strip digestion/type/volume_L attributes that
    // the LLM may have erroneously added. Backpack items use the simple
    // <Item qty="..." desc="...">name</Item> format — they are NOT prey and
    // should never have a digestion meter. This prevents the UI from breaking
    // (frontend parser reads textContent as the item name, so <Item
    // name="Waterskin" digestion="14.06%">Full</Item> would display as "Full"
    // instead of "Waterskin"). This runs regardless of the digestionEngine
    // toggle since it is a format-correction step, not a digestion
    // calculation.
    //
    // Additionally: auto-stack items with the same name (sum qty, keep longest
    // desc), and compute inventory capacity + overcapacity for the slot
    // system.
    let inventoryUniqueCount = 0
    updatedXml = updatedXml.replace(
      /<Backpack([^>]*)>([\s\S]*?)<\/Backpack>/gi,
      (match, attrs, inner) => {
        // Collect items into a map for auto-stacking
        const items: Map<string, { qty: number; desc: string }> = new Map()
        inner.replace(
          /<Item\s+([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/Item>)/gi,
          (itemMatch: string, itemAttrs: string, textContent: string | undefined) => {
            const qty = parseInt(getAttrFromString(itemAttrs, 'qty') || '1') || 1
            const desc = getAttrFromString(itemAttrs, 'desc') || ''
            const name = getAttrFromString(itemAttrs, 'name') || (textContent || '').trim()
            if (!name) return ''
            const existing = items.get(name)
            if (existing) {
              existing.qty += qty
              if (desc.length > existing.desc.length) existing.desc = desc
            } else {
              items.set(name, { qty, desc })
            }
            return ''
          },
        )
        // Rebuild XML from the stacked map
        let result = ''
        for (const [name, { qty, desc }] of items) {
          const descAttr = desc ? ` desc="${desc}"` : ''
          result += `\n    <Item qty="${qty}"${descAttr}>${name}</Item>`
        }
        inventoryUniqueCount = items.size
        return `<Backpack${attrs}>${result}\n  </Backpack>`
      },
    )

    // Compute inventory capacity: base 3 + sum of all Equip@slots attributes.
    // Inject <InventoryCapacity> and <InventoryOvercapacity> into the sheet
    // (inside <State>, same pattern as CurrentAcidPct, Climax, etc.). This runs
    // regardless of the digestionEngine toggle since it is a capacity
    // computation, not a digestion calculation.
    let clothingSlots = 0
    updatedXml.replace(
      /<Equip\s+([^>]*?)>/gi,
      (match: string, attrs: string) => {
        const slotsStr = getAttrFromString(attrs, 'slots')
        const slotsNum = parseInt(slotsStr) || 0
        if (slotsNum > 0) clothingSlots += slotsNum
        return match
      },
    )
    const capacity = Math.max(3, 3 + clothingSlots)
    const overcap = Math.max(0, inventoryUniqueCount - capacity)
    updatedXml = setStat(updatedXml, 'InventoryCapacity', capacity)
    updatedXml = setStat(updatedXml, 'InventoryOvercapacity', overcap)

    if (engineToggles.struggleEngine) {
      const struggleResult = processStruggle(updatedXml, oldXml, elapsed, modifiers.StomachResistance || 0, modifiers.EnergyDrain || 0)
      updatedXml = struggleResult.xml
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

      // Arousal feedback: prey in balls raise arousal
      if (engineToggles.cockVoreEngine) {
        const ballsMatch = updatedXml.match(/<Balls[^>]*>([\s\S]*?)<\/Balls>/i)
        if (ballsMatch) {
          const ballsPreyCount = (ballsMatch[1].match(/<Item\s+[^>]*type="Prey"[^>]*>/gi) || []).length
          if (ballsPreyCount > 0) {
            const arousalBoost = 3 * ballsPreyCount // +3 per prey per turn
            newArousal = Math.min(100, newArousal + arousalBoost)
            spindle.log.info(`[runDigestionTick] Arousal feedback: +${arousalBoost} from ${ballsPreyCount} balls prey`)
          }
        }
      }

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

          // Force-convert all remaining balls prey on climax, then expel cum
          if (engineToggles.cockVoreEngine) {
            let forceConvertedCount = 0
            let forceConvertedVol = 0

            // Force-convert all remaining prey in the balls
            const ballsMatch = updatedXml.match(/<Balls([^>]*)>([\s\S]*?)<\/Balls>/i)
            if (ballsMatch) {
              const ballsAttrs = ballsMatch[1]
              const ballsInner = ballsMatch[2]
              const preyRegex = /<Item\s+([^>]*type="Prey"[^>]*)\s*(?:\/\s*>|>([\s\S]*?)<\/Item>)/gi
              let preyMatch: RegExpExecArray | null
              while ((preyMatch = preyRegex.exec(ballsInner)) !== null) {
                const preyAttrs = preyMatch[1]
                const vol = parseFloat(getAttrFromString(preyAttrs, 'volume_L') || '0') || 0
                forceConvertedCount++
                forceConvertedVol += vol * 1000 // L → ml
              }

              if (forceConvertedCount > 0) {
                // Remove all prey items from balls content
                const emptiedBallsInner = ballsInner
                  .replace(/<Item\s+[^>]*type="Prey"[^>]*\s*(?:\/\s*>|>([\s\S]*?)<\/Item>)/gi, '')
                  .replace(/^\s*\n/gm, '')
                  .trim()

                updatedXml = updatedXml.replace(
                  /<Balls([^>]*)>[\s\S]*?<\/Balls>/i,
                  `<Balls${ballsAttrs}>\n${emptiedBallsInner}\n    </Balls>`,
                )

                // Add force-converted volume to CumVolume_ml
                const oldCumVol = getStat(updatedXml, 'CumVolume_ml') || 0
                updatedXml = setStat(updatedXml, 'CumVolume_ml', oldCumVol + forceConvertedVol)

                spindle.log.info(
                  `[runDigestionTick] Climax force-converted ${forceConvertedCount} prey, +${forceConvertedVol}ml cum`,
                )
              }
            }

            // Now expel all accumulated cum (including force-converted prey)
            const cumVol = getStat(updatedXml, 'CumVolume_ml') || 0
            if (cumVol > 0) {
              if (forceConvertedCount > 0) {
                maybeToast(
                  'climaxEvents',
                  'success',
                  `💦 Climax force-converted ${forceConvertedCount} prey and expelled ${cumVol.toFixed(0)} ml of cum!`,
                )
              } else {
                maybeToast('climaxEvents', 'success', `💦 Climax expelled ${cumVol.toFixed(0)} ml of cum!`)
              }
              spindle.log.info(`[runDigestionTick] Climax expelled ${cumVol}ml cum`)
              updatedXml = setStat(updatedXml, 'CumVolume_ml', 0)
            }
          }

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

    // Womb absorption — same nutrient absorption as stomach
    if (engineToggles.unbirthEngine && wombAbsorbedVol > 0) {
      totalDigestedVol += wombAbsorbedVol
      maybeToast('digestionTicks', 'success', `🌸 Womb absorbed ${wombAbsorbedVol.toFixed(1)}L — added to nutrient absorption.`)
    }

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

    // ─── LACTATION SYSTEM ──────────────────────────────────────
    if (engineToggles.lactationEngine) {
      const breastVol = getStat(updatedXml, 'BreastVolume_ml') || 0
      const lactRateMult = getStat(updatedXml, 'LactationRateMultiplier') || 1.0
      const milkCapacity = breastVol * 0.8

      if (breastVol > 0 && milkCapacity > 0) {
        // Count womb prey for production boost
        let wombPreyCount = 0
        const wombMatch = updatedXml.match(/<Womb[^>]*>([\s\S]*?)<\/Womb>/i)
        if (wombMatch && wombMatch[1]) {
          wombPreyCount = (wombMatch[1].match(/<Item[\s>]/gi) || []).length
        }
        const wombBoost = 1 + (wombPreyCount * 0.5)

        // Production rate: base 20 ml/h × sqrt(breast/150) × LactationRateMultiplier × lactationMult × wombBoost
        const lactationMult = 1 + (modifiers.LactationRate || 0)
        const baseRate = 20.0
        const milkRate = baseRate * Math.sqrt(breastVol / 150) * lactRateMult * lactationMult * wombBoost
        const milkProduction = milkRate * elapsed

        // Read current milk (allow LLM to have reduced it via expressing)
        const oldMilkVol = getStat(oldXml, 'MilkVolume_ml') || 0
        let milkVol = getStat(updatedXml, 'MilkVolume_ml')
        if (milkVol === null || milkVol === undefined) {
          milkVol = oldMilkVol
        }
        milkVol = Math.max(0, milkVol) // clamp negative to 0
        milkVol += milkProduction

        // Check for overcapacity
        const isLeaking = milkVol > milkCapacity
        let breastGrowthFromMilk = 0

        if (isLeaking) {
          const overflow = milkVol - milkCapacity
          breastGrowthFromMilk = overflow * 0.05 * elapsed

          // Apply breast growth from overflow
          const currentBreastVol = getStat(updatedXml, 'BreastVolume_ml') || breastVol
          const newBreastVol = currentBreastVol + breastGrowthFromMilk
          updatedXml = setStat(updatedXml, 'BreastVolume_ml', newBreastVol)

          // Cap milk at 2× capacity (recompute capacity with new breast vol)
          const newCapacity = newBreastVol * 0.8
          milkVol = Math.min(milkVol, newCapacity * 2)

          maybeToast('lactationEvents', 'warning',
            `💧 Breasts overcapacity — leaking! +${breastGrowthFromMilk.toFixed(1)}ml breast growth from overfullness.`)
          spindle.log.info(
            `Lactation: leaking! milk ${milkVol.toFixed(1)}/${milkCapacity.toFixed(1)}ml, ` +
            `+${breastGrowthFromMilk.toFixed(2)}ml breast growth, womb boost ${wombBoost}×`,
          )
        } else {
          // Check if milk just reached capacity
          const oldMilkCap = (getStat(oldXml, 'BreastVolume_ml') || 0) * 0.8
          if (oldMilkVol < oldMilkCap && milkVol >= milkCapacity * 0.95) {
            maybeToast('lactationEvents', 'info', `🥛 Breasts full — milk at capacity.`)
          }
          spindle.log.info(
            `Lactation: milk ${milkVol.toFixed(1)}/${milkCapacity.toFixed(1)}ml, ` +
            `rate ${milkRate.toFixed(1)}ml/h, womb boost ${wombBoost}×`,
          )
        }

        // Update MilkVolume_ml in XML
        updatedXml = setStat(updatedXml, 'MilkVolume_ml', Math.round(milkVol))
      } else {
        // AA cup / 0ml — no lactation possible
        updatedXml = setStat(updatedXml, 'MilkVolume_ml', 0)
      }
    } // end lactationEngine

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
    // Return the last successfully-processed XML (which may include
    // indigestion/struggle values from processStruggle) instead of the
    // raw LLM output. This prevents a late-stage error from discarding
    // computed values that the user already saw toasts for.
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
  const finalXml = await runDigestionTick(sheetXml, oldSheet, chatId)

  // ── DIAGNOSTIC: log bowels section of finalXml ──
  const bowMatchFinal = finalXml.match(/<Bowels[^>]*>([\s\S]*?)<\/Bowels>/i)
  spindle.log.info(
    `[commitUpdate] chatId=${chatId} activeChatId=${activeChatId} match=${chatId === activeChatId} | bowels=${bowMatchFinal ? bowMatchFinal[1].trim().slice(0, 300) : 'NONE'}`,
  )

  await saveChatSheet(chatId, finalXml)
  sheets.set(chatId, finalXml) // keep in-memory cache in sync
  const list = snapshots.get(chatId) || []
  list.push({ messageId, sheetXml: finalXml, chatIndex })
  snapshots.set(chatId, list)
  await saveChatSnapshots(chatId)

  if (chatId === activeChatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: finalXml })
    spindle.log.info(`[commitUpdate] SHEET_UPDATED sent to frontend`)
  } else {
    spindle.log.info(`[commitUpdate] SHEET_UPDATED SKIPPED — chatId mismatch`)
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
  if (!ctx.content.includes('<sheet_update>') && !ctx.content.includes('<action_roll')) return

  const chatId = ctx.chatId
  const update = extractSheetUpdate(ctx.content)
  const hasActionRolls = ctx.content.includes('<action_roll')

  // ── No sheet update and no action rolls — nothing to do ──────────
  if (!update && !hasActionRolls) return

  // ── Action-roll-only path: no <sheet_update> to process ──────────
  // The LLM emitted <action_roll> tags but no sheet update.  We still
  // need to process the dice rolls using the current cached sheet.
  if (!update) {
    const cachedSheet = sheets.get(chatId) ?? (await loadChatSheet(chatId)) ?? ''
    const cleanedContent = await processActionRolls(
      cachedSheet, chatId, ctx.content,
      spindle.variables.chat.get, spindle.variables.chat.delete,
    )
    // Only return a result if content was modified (tags stripped)
    return cleanedContent !== ctx.content ? { content: cleanedContent } : undefined
  }

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
  // ── Run the digestion tick (the real computation) ───────────────
  // This is the same function commitUpdate calls — it computes
  // indigestion, stamina, struggle, digestion %, acid, climax, nutrient
  // absorption, and clothing stress from the time-delta.
  const finalXml = await runDigestionTick(update, oldSheet, chatId)

  // ── DIAGNOSTIC: log bowels section of finalXml in contentProcessor ──
  const bowMatchCP = finalXml.match(/<Bowels[^>]*>([\s\S]*?)<\/Bowels>/i)
  spindle.log.info(
    `[contentProcessor] chatId=${chatId} activeChatId=${activeChatId} match=${chatId === activeChatId} | bowels=${bowMatchCP ? bowMatchCP[1].trim().slice(0, 300) : 'NONE'}`,
  )

  // ── Replace the <sheet_update> block in the message content ──────
  // The LLM's original block contained stale copied values.  We swap it
  // for the fully-computed XML so the persisted message is a self-
  // contained, accurate snapshot of the completed turn.
  let modifiedContent = ctx.content.replace(
    /<sheet_update>[\s\S]*?<\/sheet_update>/i,
    `<sheet_update>\n${finalXml}\n</sheet_update>`,
  )

  // ── Process dice action rolls (if any) ───────────────────────────
  // Strips <action_roll> tags from the content and emits toast
  // notifications with roll results.  No-op if no dicePoolState exists.
  if (hasActionRolls) {
    modifiedContent = await processActionRolls(
      finalXml, chatId, modifiedContent,
      spindle.variables.chat.get, spindle.variables.chat.delete,
    )
  }

  // ── Persist the computed sheet + update in-memory cache ──────────
  // This keeps sheets.get(chatId) in sync so the next promptInterceptor
  // sees the correct values.  If we skip this, the safety-net in
  // promptInterceptor would re-commit from the message text.
  await saveChatSheet(chatId, finalXml)
  sheets.set(chatId, finalXml)

  // ── Push a snapshot for rollback support ────────────────────────
  // commitUpdate (Tier 2) pushes a snapshot so rollbackOnDelete can
  // restore the previous sheet state when a message is deleted or
  // regenerated.  contentProcessor (Tier 1) must do the same —
  // otherwise rollbackOnDelete finds no snapshot and bails out with a
  // warning, leaving the sheet at its post-deletion state instead of
  // reverting to the pre-generation state.  Every committed message
  // must have an entry so that delete/regenerate rollbacks work
  // regardless of which tier processed the message.
  const snapList = snapshots.get(chatId) || []
  const snapIndex = ctx.swipeIndex ?? snapList.length
  snapList.push({ messageId: ctx.messageId ?? '', sheetXml: finalXml, chatIndex: snapIndex })
  snapshots.set(chatId, snapList)
  await saveChatSnapshots(chatId)

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
  // promptSheets is used by contentProcessor/commitUpdate as the "old"
  // sheet for runDigestionTick.  It is per-turn and must be deleted so
  // the GENERATION_ENDED handler can detect that contentProcessor ran
  // (it checks promptSheets.has(chatId)).
  //
  // preGenerationSheets is intentionally NOT deleted here — it must
  // persist across swipes of the same turn so that every swipe
  // variant can restore the same pre-turn baseline.  It is overwritten
  // on the next normal/continue/regenerate generation, or cleared on
  // chat switch.
  promptSheets.delete(chatId)

  // ── Notify the frontend panel so the UI updates immediately ──────
  if (chatId === activeChatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: finalXml })
    spindle.log.info(`[contentProcessor] SHEET_UPDATED sent to frontend`)
  } else {
    spindle.log.info(`[contentProcessor] SHEET_UPDATED SKIPPED — chatId mismatch`)
  }

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
    // ── Capture the pre-generation sheet for this turn ──────────
    // On "normal" (and "continue"/"regenerate") this is the sheet
    // state BEFORE the upcoming digestion tick.  We store it so that
    // if the user swipes, we can restore this exact baseline — giving
    // every swipe variant the same correct elapsed time that
    // "regenerate" gets via MESSAGE_DELETED → rollbackOnDelete.
    preGenerationSheets.set(chatId, sheet)
  } else if (genType === 'continue' || genType === 'regenerate') {
    // ── Capture the pre-generation sheet for this turn ──────────
    // Same as "normal" — store the current sheet as the pre-turn
    // baseline so swipes can restore to it.  Regenerate already gets
    // a rollback via MESSAGE_DELETED, but storing here is harmless
    // and keeps the logic uniform.
    preGenerationSheets.set(chatId, sheet)
  } else if (genType === 'swipe') {
    // ── Swipe: restore the pre-generation sheet ────────────────
    // Regenerate works correctly because it DELETEs the old message
    // (firing MESSAGE_DELETED → rollbackOnDelete → sheet restored to
    // pre-generation state) before the new generation starts.  Swipe
    // adds a variant without deleting, so the sheet stays at the
    // post-digestion state — making elapsed ≈ 0 and skipping the
    // digestion tick.  We replicate regenerate's behaviour here by
    // restoring the sheet from preGenerationSheets, which was captured
    // on the "normal"/"continue"/"regenerate" that started this turn.
    // This works for any number of repeated swipes because
    // preGenerationSheets persists across swipes of the same turn
    // (never deleted by contentProcessor).  It is overwritten on the
    // next normal/continue/regenerate, or cleared on chat switch
    // (see storage.ts switchToChat).
    const preGenSheet = preGenerationSheets.get(chatId)
    if (preGenSheet) {
      sheet = preGenSheet
      sheets.set(chatId, sheet)
      await saveChatSheet(chatId, sheet)
      spindle.log.info(
        `[promptInterceptor] Swipe: restored pre-generation sheet ` +
          `from preGenerationSheets (len=${sheet.length})`,
      )
    } else {
      spindle.log.info(
        `[promptInterceptor] Swipe: no preGenerationSheet found ` +
          `— using current sheet (first-ever generation or chat reload)`,
      )
    }
  }

  // ─── Store the prompt-time sheet snapshot ───────────────────
  // This is the exact sheet XML the LLM sees in its prompt.  The
  // contentProcessor and commitUpdate use it as the "old" sheet for
  // runDigestionTick, decoupling them from the race condition where
  // GENERATION_ENDED might update sheets.get(chatId) first.
  promptSheets.set(chatId, sheet)

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

  // ─── Dice Pool: pre-roll dice and inject values into prompt ────
  // If the dice system is enabled and the sheet has a <DicePool> config,
  // we roll all dice NOW (before LLM generation) and store the results
  // in a chat variable.  The rolled values are injected into the prompt
  // so the LLM can consume them sequentially via <action_roll> tags.
  // The contentProcessor picks up the stored state and processes any
  // <action_roll> tags in the LLM's response.
  let dicePoolInjection = ''
  if (engineToggles.diceSystem) {
    const diceSections = parseDiceConfig(sheet)
    if (diceSections.length > 0) {
      const rolledSections = rollDicePool(diceSections)
      // Store the rolled pool for contentProcessor to consume
      await spindle.variables.chat.set(chatId, 'dicePoolState', JSON.stringify(rolledSections))
      dicePoolInjection = buildDicePoolPrompt(rolledSections)
    }
  }

  const injection = {
    role: 'system' as const,
    content: buildSheetPrompt(sheet) + populateInstructions + struggleNotification + dicePoolInjection,
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
