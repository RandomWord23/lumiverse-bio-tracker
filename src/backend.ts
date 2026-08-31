declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import {
  sheets,
  snapshots,
  committedMessageIds,
  activeChatId,
  pendingGenerationType,
  toastSettings,
  setToastSettings,
  engineToggles,
  setEngineToggles,
} from './backend/state'

import {
  maybeToast,
  extractTextContent,
  extractSheetUpdate,
} from './backend/engine'

import {
  saveChatSheet,
  switchToChat,
} from './backend/storage'

import {
  commitUpdate,
  rollbackOnDelete,
  promptInterceptor,
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
    await saveChatSheet(activeChatId, msg.xmlData)
    await spindle.variables.chat.set(activeChatId, 'manualSyncPending', 'true')
    spindle.log.info(`Sheet synced from frontend for chat ${activeChatId}`)
    maybeToast('sheetSync', 'success', 'Character sheet synced!')
  }

  if (msg.type === 'GET_LATEST_SHEET') {
    if (!activeChatId) {
      maybeToast('chatWarnings', 'warning', 'Open a chat first.')
      return
    }
    await spindle.variables.chat.delete(activeChatId, 'manualSyncPending')

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
})

spindle.registerInterceptor(promptInterceptor, 50)

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
  if (chatId !== activeChatId) return
  if (pendingGenerationType === 'swipe' || pendingGenerationType === 'regenerate') {
    return
  }
  if (committedMessageIds.has(messageId)) return
  if (!update) return

  const list = snapshots.get(chatId) || []
  const chatIndex = list.length
  await commitUpdate(chatId, messageId, update, chatIndex)
  committedMessageIds.add(messageId)

  maybeToast('digestionTicks', 'success', 'Sheet updated - digestion tick applied')
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

spindle.on('MESSAGE_DELETED', async (payload: any) => {
  const { chatId, messageId } = payload
  if (chatId) await rollbackOnDelete(chatId, messageId)
})

spindle.log.info('Bio Tracker backend loaded (Digestion Engine v9)')
