declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ═══════════════════════════════════════════════════════════════
// BIO TRACKER — Backend (per-chat edition)
// ═══════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────

interface Snapshot {
  messageId: string
  sheetXml: string
  chatIndex: number
}

// ─── State ─────────────────────────────────────────────────────
//
// We keep a map of chatId -> sheet XML so the interceptor can
// quickly look up the right sheet for whichever chat is generating.
// We also keep the "active chatId" so the frontend sync button
// knows which chat to save to.

let activeChatId: string | null = null
const sheets: Map<string, string> = new Map()
const snapshots: Map<string, Snapshot[]> = new Map()

// ─── Storage paths ─────────────────────────────────────────────
//
// Each chat gets its own files inside our storage folder:
//   sheets/<chatId>.xml      — the current sheet for that chat
//   snapshots/<chatId>.json  — the snapshot history for that chat

function sheetPath(chatId: string) {
  return `sheets/${chatId}.xml`
}

function snapshotsPath(chatId: string) {
  return `snapshots/${chatId}.json`
}

// ─── Load / save per chat ──────────────────────────────────────

async function loadChatSheet(chatId: string) {
  try {
    const data = await spindle.storage.read(sheetPath(chatId))
    if (data) {
      sheets.set(chatId, data)
      return data
    }
  } catch (e) {
    // File doesn't exist yet — that's fine, it's a new chat
  }
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

// ─── Switch to a chat ──────────────────────────────────────────
//
// Called when the user opens a different chat. Loads that chat's
// sheet and snapshots into memory, then tells the frontend to
// refresh its form fields.

async function switchToChat(chatId: string | null) {
  activeChatId = chatId

  if (!chatId) {
    // User went to the home screen — clear the frontend
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: '' })
    return
  }

  const sheet = await loadChatSheet(chatId)
  await loadChatSnapshots(chatId)

  spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: sheet || '' })
  spindle.log.info(`Switched to chat ${chatId}`)
}

// ─── Text extraction helpers ───────────────────────────────────

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part.type === 'text')
      .map((part: any) => part.text)
      .join('\n')
  }
  return ''
}

function extractSheetUpdate(content: string): string | null {
  const match = content.match(
    /<sheet_update>\s*([\s\S]*?)\s*<\/sheet_update>/i
  )
  return match ? match[1].trim() : null
}

function findLastAssistantMessage(messages: any[]): any | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.__isChatHistory) {
      return msg
    }
  }
  return null
}

// ─── Commit + rollback ─────────────────────────────────────────

async function commitUpdate(
  chatId: string,
  messageId: string,
  sheetXml: string,
  chatIndex: number
) {
  await saveChatSheet(chatId, sheetXml)

  const list = snapshots.get(chatId) || []
  list.push({ messageId, sheetXml, chatIndex })
  snapshots.set(chatId, list)

  await saveChatSnapshots(chatId)

  if (chatId === activeChatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: sheetXml })
  }

  spindle.log.info(`Sheet committed for message ${messageId} in chat ${chatId}`)
}

async function rollbackOnDelete(chatId: string, messageId: string) {
  const list = snapshots.get(chatId)
  if (!list) return

  const hadSnapshot = list.some(s => s.messageId === messageId)

  const newList = list.filter(s => s.messageId !== messageId)
  snapshots.set(chatId, newList)

  if (!hadSnapshot) return

  if (newList.length > 0) {
    const latest = newList.reduce((a, b) =>
      a.chatIndex > b.chatIndex ? a : b
    )
    await saveChatSheet(chatId, latest.sheetXml)
    if (chatId === activeChatId) {
      spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: latest.sheetXml })
    }
  }

  await saveChatSnapshots(chatId)
  spindle.log.info(`Rolled back in chat ${chatId} after deletion of ${messageId}`)
}

// ─── Build the injection prompt ────────────────────────────────

function buildSheetPrompt(sheetXml: string): string {
  return `[CHARACTER SHEET SYSTEM

You are operating with a persistent character sheet tracker. Below is the current state of the character sheet. You must stay aware of these values and act consistently with them.

<CurrentCharacterSheet>
${sheetXml}
</CurrentCharacterSheet>

─── UPDATE INSTRUCTIONS ───

When the character sheet changes during the scene (stats modified, items gained or lost, prey swallowed or digested, clothing changed, etc.), you MUST include an updated copy of the FULL sheet inside a <sheet_update> block at the very END of your response:

<sheet_update>
<CharacterSheet>
  ...the complete updated sheet with ALL fields, not just changed ones...
</CharacterSheet>
</sheet_update>

Rules:
- Output the COMPLETE sheet every time something changes, not just the changed fields
- The <sheet_update> block is invisible to the user — do not mention it in your visible text
- If absolutely nothing on the sheet changed, you may omit the block
- Always include all sections (BaseStats, Clothing, Backpack, SkillsAndTraits, DigestiveTract) even if some are empty
- For the DigestiveTract, update digestion percentages, prey life status, volumes, and belly/mobility status based on what happened in the scene
- Remove prey or food that has been fully digested or has left the body
- When prey is fully digested, move their remains to the Bowels section`
}

// ─── Frontend message handler ──────────────────────────────────
//
// The frontend sends SYNC_BIO_DATA when the user clicks sync.
// We save it to the currently active chat.

spindle.onFrontendMessage(async (msg: any) => {
  if (msg.type === 'SYNC_BIO_DATA' && msg.xmlData) {
    if (!activeChatId) {
      spindle.toast.warning('Open a chat first before syncing the sheet.')
      return
    }

    await saveChatSheet(activeChatId, msg.xmlData)
    spindle.log.info(`Sheet synced from frontend for chat ${activeChatId}`)
    spindle.toast.success('Character sheet synced!')
  }
})

// ─── The Interceptor ───────────────────────────────────────────

spindle.registerInterceptor(async (messages, context) => {
  const ctx = context as any
  const chatId: string = ctx.chatId
  const genType: string = ctx.generationType

  // Load this chat's sheet if we haven't already
  let sheet = sheets.get(chatId)
  if (sheet === undefined) {
    sheet = (await loadChatSheet(chatId)) || ''
  }

  // No sheet for this chat yet — don't inject anything
  if (!sheet) return messages

  // ── Commit previous update on new messages only ──
  if (genType === 'normal') {
    const lastAssistant = findLastAssistantMessage(messages)

    if (lastAssistant && lastAssistant.sourceMessageId) {
      const content = extractTextContent(lastAssistant.content)
      const update = extractSheetUpdate(content)

      if (update) {
        const chatIndex = lastAssistant.sourceIndexInChat ?? 0
        await commitUpdate(
          chatId,
          lastAssistant.sourceMessageId,
          update,
          chatIndex
        )
        // Reload the sheet after commit
        sheet = sheets.get(chatId) || sheet
      }
    }
  }

  // ── Inject current sheet ──
  const injection = {
    role: 'system' as const,
    content: buildSheetPrompt(sheet),
  }

  return {
    messages: [injection, ...messages],
    breakdown: [{ messageIndex: 0, name: 'Character Sheet' }],
  }
}, 50)

// ─── Events ────────────────────────────────────────────────────

// User switched to a different chat
spindle.on('CHAT_SWITCHED', async (payload: any) => {
  await switchToChat(payload.chatId)
})

// User deleted a message — roll back if needed
spindle.on('MESSAGE_DELETED', async (payload: any) => {
  const { chatId, messageId } = payload
  if (chatId) await rollbackOnDelete(chatId, messageId)
})

// ─── Startup ───────────────────────────────────────────────────
//
// We don't know which chat is active yet, so we wait for the
// first CHAT_SWITCHED event. The frontend will get a SHEET_UPDATED
// message with the correct sheet at that point.

spindle.log.info('Bio Tracker backend loaded (per-chat mode)')
