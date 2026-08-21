declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ═══════════════════════════════════════════════════════════════
// BIO TRACKER — Backend
// ═══════════════════════════════════════════════════════════════
//
// This file runs in an isolated Bun worker. It does three things:
//
//   1. Stores the character sheet XML received from the frontend
//   2. Injects that XML into every LLM generation via an interceptor
//   3. Parses <sheet_update> blocks from the LLM's previous response
//      and commits them as the new current sheet — but ONLY when the
//      user sends a new message, never on swipes or regenerations
//
// ═══════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────

// A snapshot is a saved copy of the sheet at a specific point in the
// chat. We use these for rollback when messages are deleted.
interface Snapshot {
  messageId: string       // which assistant message produced this sheet
  sheetXml: string        // the full XML at that point
  chatIndex: number       // position in the chat (for ordering)
}

// ─── In-memory state ───────────────────────────────────────────
//
// These variables hold the current state while the extension is
// running. We also save them to disk so they survive restarts.

let currentSheetXml: string = ''         // the "live" sheet
let snapshots: Snapshot[] = []           // history of committed sheets

// ─── Storage file names ────────────────────────────────────────
//
// spindle.storage gives us a private folder just for this extension.
// We store two files: the current sheet and the snapshot history.

const SHEET_FILE = 'current_sheet.xml'
const SNAPSHOTS_FILE = 'snapshots.json'

// ─── Load saved state on startup ───────────────────────────────
//
// When the extension starts, we read our files from storage so the
// sheet survives restarts.

async function loadState() {
  try {
    const data = await spindle.storage.read(SHEET_FILE)
    if (data) currentSheetXml = data
  } catch (e) {
    spindle.log.warn(`Could not load sheet: ${e}`)
  }

  try {
    const data = await spindle.storage.read(SNAPSHOTS_FILE)
    if (data) snapshots = JSON.parse(data)
  } catch (e) {
    spindle.log.warn(`Could not load snapshots: ${e}`)
  }
}

// ─── Save state to storage ─────────────────────────────────────

async function saveSheet() {
  await spindle.storage.write(SHEET_FILE, currentSheetXml)
}

async function saveSnapshots() {
  await spindle.storage.write(SNAPSHOTS_FILE, JSON.stringify(snapshots))
}

// ─── Extract text from message content ─────────────────────────
//
// Message content can be a plain string OR an array of "parts"
// (text, images, tool calls, etc.). This helper always returns
// a plain string so we can search it with regex.

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

// ─── Extract <sheet_update> block from a message ───────────────
//
// The LLM includes a block like:
//   <sheet_update>
//   <CharacterSheet>...full XML...</CharacterSheet>
//   </sheet_update>
//
// This function finds it and returns the inner XML.
// Returns null if the message has no update block.

function extractSheetUpdate(content: string): string | null {
  const match = content.match(
    /<sheet_update>\s*([\s\S]*?)\s*<\/sheet_update>/i
  )
  return match ? match[1].trim() : null
}

// ─── Find the last assistant message in chat history ───────────
//
// The `messages` array passed to the interceptor contains all
// messages that will be sent to the LLM. We walk backwards to find
// the most recent assistant reply that came from stored chat history
// (as opposed to something injected by another extension).

function findLastAssistantMessage(messages: any[]): any | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.__isChatHistory) {
      return msg
    }
  }
  return null
}

// ─── Commit a sheet update ─────────────────────────────────────
//
// "Committing" means: replace the current sheet with the new one
// and save a snapshot so we can roll back later.

async function commitUpdate(
  messageId: string,
  sheetXml: string,
  chatIndex: number
) {
  currentSheetXml = sheetXml

  // Save a snapshot — this is our restore point
  snapshots.push({ messageId, sheetXml, chatIndex })

  await saveSheet()
  await saveSnapshots()

  // Tell the frontend to refresh its UI with the new values
  spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: currentSheetXml })

  spindle.log.info(`Sheet committed for message ${messageId}`)
}

// ─── Rollback when a message is deleted ────────────────────────
//
// When the user deletes a message, we remove its snapshot and
// restore the sheet to the most recent remaining snapshot.

async function rollbackOnDelete(messageId: string) {
  const hadSnapshot = snapshots.some(s => s.messageId === messageId)

  // Remove the deleted message's snapshot
  snapshots = snapshots.filter(s => s.messageId !== messageId)

  if (!hadSnapshot) return // nothing to roll back

  // Find the latest remaining snapshot (highest chatIndex = most recent)
  if (snapshots.length > 0) {
    const latest = snapshots.reduce((a, b) =>
      a.chatIndex > b.chatIndex ? a : b
    )
    currentSheetXml = latest.sheetXml
  }
  // If no snapshots remain, keep the current sheet as-is.
  // The user can re-sync from the UI if needed.

  await saveSheet()
  await saveSnapshots()

  spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: currentSheetXml })
  spindle.log.info(`Rolled back after deletion of ${messageId}`)
}

// ─── Build the system prompt for sheet injection ───────────────
//
// This is the text that gets injected as a system message before
// every generation. It tells the LLM what the current sheet looks
// like and how to format updates.

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
// The frontend sends { type: 'SYNC_BIO_DATA', xmlData: xml }
// when the user clicks the "Sync" button. We store the XML.

spindle.onFrontendMessage(async (msg: any) => {
  if (msg.type === 'SYNC_BIO_DATA' && msg.xmlData) {
    currentSheetXml = msg.xmlData
    await saveSheet()
    spindle.log.info('Sheet synced from frontend')
    spindle.toast.success('Character sheet synced to backend!')
  }
})

// ─── The Interceptor ───────────────────────────────────────────
//
// This is the core of the extension. It runs right before every LLM
// generation. It does two things:
//
//   1. If this is a NEW message (not a swipe), it looks at the last
//      assistant response in the chat, finds the <sheet_update> block,
//      and commits it as the new current sheet.
//
//   2. It injects the current sheet as a system message so the LLM
//      always knows the current state.

spindle.registerInterceptor(async (messages, context) => {
  // If the user hasn't synced a sheet yet, don't inject anything
  if (!currentSheetXml) return messages

  const ctx = context as any
  const genType: string = ctx.generationType

  // ── Step 1: Commit the previous update (only on new messages) ──
  //
  // generationType tells us what kind of generation this is:
  //   "normal"     — user sent a new message
  //   "swipe"      — user swiped for a new response to the same message
  //   "regenerate" — user regenerated the last response
  //   "continue"   — user continued the last response
  //
  // We ONLY commit on "normal". Swipes and regenerations get the
  // same injected sheet so the LLM tries again with the same state.

  if (genType === 'normal') {
    const lastAssistant = findLastAssistantMessage(messages)

    if (lastAssistant && lastAssistant.sourceMessageId) {
      const content = extractTextContent(lastAssistant.content)
      const update = extractSheetUpdate(content)

      if (update) {
        const chatIndex = lastAssistant.sourceIndexInChat ?? 0
        await commitUpdate(
          lastAssistant.sourceMessageId,
          update,
          chatIndex
        )
      }
    }
  }

  // ── Step 2: Inject the current sheet ──
  //
  // This happens for ALL generation types. The LLM always sees
  // the current committed sheet state.

  const injection = {
    role: 'system' as const,
    content: buildSheetPrompt(currentSheetXml),
  }

  return {
    messages: [injection, ...messages],
    breakdown: [{ messageIndex: 0, name: 'Character Sheet' }],
  }
}, 50) // priority 50 = runs early, before most other interceptors

// ─── Message deleted handler ───────────────────────────────────
//
// When the user deletes a message, we remove its snapshot and
// roll back to the most recent remaining one.

spindle.on('MESSAGE_DELETED', async (payload: any) => {
  const { messageId } = payload
  await rollbackOnDelete(messageId)
})

// ─── Chat switched handler ─────────────────────────────────────
//
// When the user switches to a different chat, we reload state
// and tell the frontend to refresh.

spindle.on('CHAT_SWITCHED', async (payload: any) => {
  await loadState()
  spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: currentSheetXml })
})

// ─── Startup ───────────────────────────────────────────────────
//
// Load saved state and notify the frontend.

loadState().then(() => {
  spindle.log.info('Bio Tracker backend loaded')
  spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: currentSheetXml })
})
