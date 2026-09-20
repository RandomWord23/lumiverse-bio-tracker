declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import { sheets, snapshots, committedMessageIds, setActiveChatId, type Snapshot } from './state'
import { sheetPath, snapshotsPath, sanitizeSheetXml } from './engine'

export async function loadChatSheet(chatId: string) {
  try {
    const data = await spindle.storage.read(sheetPath(chatId))
    if (data) {
      // Sanitize on load — fixes any corruption that was persisted
      // to disk before the sanitize gate was added to saveChatSheet.
      const clean = sanitizeSheetXml(data)
      sheets.set(chatId, clean)
      return clean
    }
  } catch (e) {}
  return null
}

export async function saveChatSheet(chatId: string, xml: string) {
  // Universal sanitization gate — every save goes through this,
  // regardless of which code path calls saveChatSheet.  This
  // catches corruption from the LLM (conversion on Stomach items,
  // newlines inside multiplier tags) that bypassed runDigestionTick
  // via unsanitized paths (GENERATION_ENDED fallback, SYNC_BIO_DATA,
  // GET_LATEST_SHEET, SPEND_ATTRIBUTE_POINT, rollbackOnDelete).
  const clean = sanitizeSheetXml(xml)
  sheets.set(chatId, clean)
  await spindle.storage.write(sheetPath(chatId), clean)
}

export async function loadChatSnapshots(chatId: string) {
  // getJson handles missing files and parse errors via the fallback option,
  // eliminating the need for a manual try/catch + JSON.parse.
  const data = await spindle.storage.getJson<Snapshot[]>(snapshotsPath(chatId), { fallback: [] })
  snapshots.set(chatId, data)
}

export async function saveChatSnapshots(chatId: string) {
  const list = snapshots.get(chatId) || []
  await spindle.storage.setJson(snapshotsPath(chatId), list, { indent: 2 })
}

export async function switchToChat(chatId: string | null) {
  setActiveChatId(chatId)
  committedMessageIds.clear()
  // NOTE: preGenerationSheet is now stored per-chat via
  // spindle.variables.chat, so there is no global Map to clear here.
  // Each chat has its own 'preGenerationSheet' variable that persists
  // until overwritten by the next normal/continue/regenerate generation.
  if (!chatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: '' })
    return
  }
  const sheet = await loadChatSheet(chatId)
  await loadChatSnapshots(chatId)
  spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: sheet || '' })
  spindle.log.info(`Switched to chat ${chatId}`)
}
