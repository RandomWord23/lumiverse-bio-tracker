declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import {
  sheets,
  activeChatId,
  toastSettings,
  setToastSettings,
  engineToggles,
  setEngineToggles,
} from './backend/state'

import {
  maybeToast,
  extractTextContent,
  extractSheetUpdate,
  spendAttributePoint,
  sanitizeSheetXml,
  getLatestAssistantMessage,
} from './backend/engine'

import {
  saveChatSheet,
  loadChatSheet,
  switchToChat,
} from './backend/storage'

import {
  commitUpdate,
  promptInterceptor,
  contentProcessor,
} from './backend/interceptor'

spindle.onFrontendMessage(async (msg: any) => {
  if (msg.type === 'SETTINGS_UPDATED') {
    if (msg.toastSettings) setToastSettings({ ...toastSettings, ...msg.toastSettings })
    if (msg.engineToggles) setEngineToggles({ ...engineToggles, ...msg.engineToggles })
    spindle.log.info('Settings updated from frontend')
    return
  }

  if (msg.type === 'SYNC_BIO_DATA' && msg.xmlData) {
    if (!activeChatId) {
      maybeToast('chatWarnings', 'warning', 'Open a chat first before syncing the sheet.')
      return
    }

    // ── Phase 1: Direct message edit ──────────────────────────
    // The chat history IS the database.  Instead of stashing the synced
    // sheet in a variable and waiting for the next generation to pick it
    // up, we immediately edit the most recent AI message in-place,
    // replacing (or appending) its <sheet_update> block with the new XML.
    const aiMsg = await getLatestAssistantMessage(activeChatId)
    if (aiMsg) {
      const rawContent = extractTextContent(aiMsg.content)
      const newBlock = `<sheet_update>\n${msg.xmlData}\n</sheet_update>`
      let modifiedContent: string
      if (/<sheet_update>[\s\S]*?<\/sheet_update>/i.test(rawContent)) {
        modifiedContent = rawContent.replace(
          /<sheet_update>[\s\S]*?<\/sheet_update>/i,
          newBlock,
        )
      } else {
        modifiedContent = `${rawContent}\n\n${newBlock}`
      }
      try {
        await spindle.chat.updateMessage(activeChatId, aiMsg.id, { content: modifiedContent })
        spindle.log.info(`SYNC_BIO_DATA: edited message ${aiMsg.id} in chat ${activeChatId}`)
      } catch (e) {
        spindle.log.error(`SYNC_BIO_DATA: updateMessage failed: ${e}`)
      }
    } else {
      spindle.log.info(`SYNC_BIO_DATA: no assistant message found in chat ${activeChatId}`)
    }

    // Update the in-memory cache + persisted sheet file so the frontend
    // and promptInterceptor see the new sheet immediately.
    await saveChatSheet(activeChatId, msg.xmlData)
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: msg.xmlData })
    maybeToast('sheetSync', 'success', 'Character sheet synced!')
  }

  if (msg.type === 'GET_LATEST_SHEET') {
    if (!activeChatId) {
      maybeToast('chatWarnings', 'warning', 'Open a chat first.')
      return
    }
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

  if (msg.type === 'GET_THEME') {
    try {
      const theme = await spindle.theme.getCurrent()
      spindle.sendToFrontend({
        type: 'THEME_INFO',
        mode: theme.mode,
        accent: theme.accent,
        fontScale: theme.fontScale,
        radiusScale: theme.radiusScale,
      })
    } catch (e) {
      spindle.log.error(`GET_THEME: failed to read theme: ${e}`)
      spindle.sendToFrontend({ type: 'THEME_INFO', mode: 'dark', accent: { h: 0, s: 70, l: 60 }, fontScale: 1, radiusScale: 1 })
    }
  }

  if (msg.type === 'POPULATE_FIELDS' && msg.fields) {
    if (!activeChatId) {
      maybeToast('chatWarnings', 'warning', 'Open a chat first.')
      return
    }

    // Guard: reject if a populate is already in progress (prevents spam)
    const existingPopulate = await spindle.variables.chat.get(
      activeChatId,
      'populatePending',
    )
    if (existingPopulate) {
      spindle.sendToFrontend({ type: 'POPULATE_DONE', success: false })
      return
    }

    const fields = msg.fields as string[]
    await spindle.variables.chat.set(
      activeChatId,
      'populateFields',
      fields.join(', '),
    )
    // Track that a populate generation is pending so GENERATION_ENDED
    // can notify the frontend when it completes.
    await spindle.variables.chat.set(
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
      await spindle.variables.chat.delete(
        activeChatId,
        'populateFields',
      )
      await spindle.variables.chat.delete(
        activeChatId,
        'populatePending',
      )
      spindle.sendToFrontend({ type: 'POPULATE_DONE', success: false })
    }
  }

  if (msg.type === 'SPEND_ATTRIBUTE_POINT' && msg.attrKey) {
    if (!activeChatId) {
      maybeToast('chatWarnings', 'warning', 'Open a chat first.')
      return
    }
    const sheet = sheets.get(activeChatId) || (await loadChatSheet(activeChatId)) || ''
    if (!sheet) {
      maybeToast('errors', 'warning', 'No character sheet found to spend attribute points on.')
      spindle.sendToFrontend({ type: 'ATTRIBUTE_SPENT', success: false, message: 'No sheet found.' })
      return
    }
    const result = spendAttributePoint(sheet, msg.attrKey as string)
    if (result.success) {
      await saveChatSheet(activeChatId, result.xml)
      spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: result.xml })
      maybeToast('progressionEvents', 'success', result.message)
    } else {
      maybeToast('progressionEvents', 'warning', result.message)
    }
    spindle.sendToFrontend({ type: 'ATTRIBUTE_SPENT', success: result.success, message: result.message })
  }

  // ── MOBILE-VISIBLE DIAGNOSTIC: frontend sends diagnostic messages ──
  if (msg.type === 'FRONTEND_DIAGNOSTIC' && msg.message) {
    maybeToast('errors', 'info', `[Frontend] ${msg.message}`)
    spindle.log.info(`[FRONTEND_DIAGNOSTIC] ${msg.message}`)
  }
})

spindle.registerInterceptor(promptInterceptor, 50)

// ── Tier 1: Message Content Processor ───────────────────────────
// Runs BEFORE the message reaches the database.  This is the primary
// processing path: it intercepts the LLM's <sheet_update> block,
// runs runDigestionTick to compute dynamic attributes (indigestion,
// stamina, struggle, digestion %, acid, climax, etc.), and replaces
// the block with the fully-computed XML.  The message is then
// persisted with correct values on first paint.
//
// If this handler throws or times out (10 000 ms), Lumiverse passes
// the un-mutated content forward and GENERATION_ENDED (Tier 2) acts
// as a fallback via commitUpdate.
spindle.registerMessageContentProcessor(contentProcessor, 50)

spindle.on('GENERATION_ENDED', async (payload: any) => {
  const { chatId, messageId, content } = payload
  const update = content ? extractSheetUpdate(content) : null

  // ─── Populate completion notification ──────────────────────
  // Clean up populatePending regardless of error/success — prevents
  // a failed or aborted populate generation from blocking all future
  // populate attempts (the flag would otherwise stay set forever).
  if (chatId) {
    const populatePending = await spindle.variables.chat.get(
      chatId,
      'populatePending',
    )
    if (populatePending) {
      await spindle.variables.chat.delete(chatId, 'populatePending')
      spindle.sendToFrontend({
        type: 'POPULATE_DONE',
        success: !!update,
      })
    }
  }

  if (payload.error) return
  if (!chatId || !messageId || !content) return
  // ── Relax activeChatId guard ──────────────────────────────────
  // Previously this returned early when chatId !== activeChatId, which
  // silently skipped the Tier 2 fallback (commitUpdate + updateMessage
  // rewrite) whenever the user switched chats during generation or
  // activeChatId was stale/null.  All computation and storage below
  // uses chatId from the payload, not activeChatId, so it is safe to
  // proceed.  We log the mismatch for diagnostics.
  if (chatId !== activeChatId) {
    spindle.log.info(
      `[GENERATION_ENDED] chatId ${chatId} !== activeChatId ${activeChatId} — proceeding anyway`,
    )
  }
  if (!update) return

  // ─── Tier 2 fallback: run commitUpdate if Tier 1 didn't ──────
  // commitUpdate is now idempotent: it fetches the "old" sheet from
  // chat history via getLatestSheetFromHistory(chatId, messageId),
  // so running it twice for the same message produces the same
  // result.  This eliminates the need for promptSheets guards,
  // committedMessageIds dedup, or snapshots.
  //
  // If contentProcessor (Tier 1) already ran, sheets.get(chatId)
  // holds the final computed sheet.  commitUpdate will fetch the
  // pre-turn sheet from history as "old", run the digestion tick
  // again with the same inputs, and produce the same result — a
  // harmless no-op.  If Tier 1 didn't run, this is the primary
  // computation path.
  const finalXml = await commitUpdate(chatId, messageId, update)

  // ─── Rewrite visible chat text with computed values ─────────
  // This corrects the <sheet_update> block in the visible message,
  // whether contentProcessor ran or not.  If contentProcessor
  // already modified the content, this is a no-op (same finalXml).
  //
  // CRITICAL: payload.content may be a string OR an array of content
  // parts (e.g. [{type:'text', text:'...'}]).  extractSheetUpdate
  // handles both, but String.replace() only works on strings.  We
  // must normalize to a plain string first via extractTextContent.
  try {
    const contentStr = extractTextContent(content)
    const sheetRegex = /<sheet_update>[\s\S]*?<\/sheet_update>/i
    const hasSheetBlock = sheetRegex.test(contentStr)

    if (!hasSheetBlock) {
      // The payload content doesn't contain a <sheet_update> block.
      // This can happen if the LLM used a different tag format, or if
      // the payload structure is unexpected.  Log so we can diagnose
      // instead of silently failing.
      spindle.log.warn(
        `[GENERATION_ENDED] No <sheet_update> block found in content ` +
          `(type=${typeof content}, len=${contentStr.length}, ` +
          `preview="${contentStr.slice(0, 200)}...")`,
      )
    } else {
      const modifiedContent = contentStr.replace(
        sheetRegex,
        `<sheet_update>\n${finalXml}\n</sheet_update>`,
      )
      await spindle.chat.updateMessage(chatId, messageId, { content: modifiedContent })
      spindle.log.info(
        `[GENERATION_ENDED] Rewrote visible chat text for message ${messageId} ` +
          `(content len ${contentStr.length} → ${modifiedContent.length})`,
      )
    }
  } catch (err) {
    spindle.log.error(`[GENERATION_ENDED] updateMessage fallback failed: ${err}`)
    maybeToast('digestionTicks', 'warning', `Sheet saved but visible text update failed: ${err}`)
  }
})

// ─── Generation stopped safety net ───────────────────────────
// GENERATION_ENDED may or may not fire after a manual abort. This
// handler ensures pending populate state is always cleaned up so
// a stopped generation doesn't leave populatePending set forever.
spindle.on('GENERATION_STOPPED', async (payload: any) => {
  const chatId = payload?.chatId
  if (!chatId) return
  const populatePending = await spindle.variables.chat.get(chatId, 'populatePending')
  if (populatePending) {
    await spindle.variables.chat.delete(chatId, 'populatePending')
    spindle.sendToFrontend({ type: 'POPULATE_DONE', success: false })
    spindle.log.info('Generation stopped — cleaned up pending populate flag')
  }
})

spindle.on('CHAT_SWITCHED', async (payload: any) => {
  await switchToChat(payload.chatId)
})

spindle.log.info('Bio Tracker backend loaded (Digestion Engine v9)')
