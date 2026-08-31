declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import { sheets, snapshots, committedMessageIds, setActiveChatId, type Snapshot } from './state'
import { sheetPath, snapshotsPath } from './engine'

export async function loadChatSheet(chatId: string) {
  try {
    const data = await spindle.storage.read(sheetPath(chatId))
    if (data) {
      sheets.set(chatId, data)
      return data
    }
  } catch (e) {}
  return null
}

export async function saveChatSheet(chatId: string, xml: string) {
  sheets.set(chatId, xml)
  await spindle.storage.write(sheetPath(chatId), xml)
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
  if (!chatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: '' })
    return
  }
  const sheet = await loadChatSheet(chatId)
  await loadChatSnapshots(chatId)
  spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: sheet || '' })
  spindle.log.info(`Switched to chat ${chatId}`)
}
