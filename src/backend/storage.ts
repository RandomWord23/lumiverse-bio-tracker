declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import { sheets, setActiveChatId } from './state'
import { sheetPath, sanitizeSheetXml } from './engine'

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
  // GET_LATEST_SHEET, SPEND_ATTRIBUTE_POINT).
  const clean = sanitizeSheetXml(xml)
  sheets.set(chatId, clean)
  await spindle.storage.write(sheetPath(chatId), clean)
}

export async function switchToChat(chatId: string | null) {
  setActiveChatId(chatId)
  if (!chatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: '' })
    return
  }
  const sheet = await loadChatSheet(chatId)
  spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: sheet || '' })
  spindle.log.info(`Switched to chat ${chatId}`)
}
