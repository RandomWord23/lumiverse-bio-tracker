declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import { sheets, snapshots, committedMessageIds, setActiveChatId } from './state'
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

export async function saveChatSnapshots(chatId: string) {
  const list = snapshots.get(chatId) || []
  await spindle.storage.write(snapshotsPath(chatId), JSON.stringify(list))
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
