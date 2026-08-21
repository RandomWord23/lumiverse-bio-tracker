declare const spindle: import('lumiverse-spindle-types').SpindleAPI

interface Snapshot {
  messageId: string
  sheetXml: string
  chatIndex: number
}

let activeChatId: string | null = null
let pendingGenerationType: string = 'normal'
const sheets: Map<string, string> = new Map()
const snapshots: Map<string, Snapshot[]> = new Map()
const committedMessageIds: Set<string> = new Set()

function sheetPath(chatId: string) {
  return `sheets/${chatId}.xml`
}
function snapshotsPath(chatId: string) {
  return `snapshots/${chatId}.json`
}

async function loadChatSheet(chatId: string) {
  try {
    const data = await spindle.storage.read(sheetPath(chatId))
    if (data) {
      sheets.set(chatId, data)
      return data
    }
  } catch (e) {}
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

async function switchToChat(chatId: string | null) {
  activeChatId = chatId
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

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('\n')
  }
  return ''
}

function extractSheetUpdate(content: unknown): string | null {
  let text = ''
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    text = content
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('\n')
  } else {
    return null
  }

  const match = text.match(
    /<sheet_update>\s*([\s\S]*?)\s*<\/sheet_update>/i,
  )
  return match ? match[1].trim() : null
}

function findLastAssistantMessage(messages: any[]): any | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.__isChatHistory) return msg
  }
  return null
}

function getAttrFromString(str: string, attr: string): string {
  const match = str.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
  return match ? match[1] : ''
}

function runDigestionTick(newXml: string, oldXml: string): string {
  try {
    const getTimeHours = (xml: string) => {
      const match = xml.match(/<Time>(.*?)<\/Time>/i)
      if (!match) return null
      const timeStr = match[1].trim()
      const parts = timeStr.split(':').map(Number)
      if (
        parts.length === 2 &&
        !isNaN(parts[0]) &&
        !isNaN(parts[1])
      ) {
        return parts[0] + parts[1] / 60
      }
      const h = parseFloat(timeStr)
      return isNaN(h) ? null : h
    }

    const oldTime = getTimeHours(oldXml)
    const newTime = getTimeHours(newXml)

    if (oldTime === null || newTime === null) {
      spindle.log.info('Digestion tick skipped: missing time')
      return newXml
    }

    let elapsed = newTime - oldTime
    if (elapsed < 0) elapsed += 24
    if (elapsed === 0) {
      spindle.log.info('Digestion tick skipped: 0 hours elapsed')
      return newXml
    }

    const getStat = (xml: string, tag: string) => {
      const match = xml.match(
        new RegExp(`<${tag}>(.*?)<\\/${tag}>`, 'i'),
      )
      return match ? parseFloat(match[1]) : 0
    }

    let acidLevel = getStat(newXml, 'CurrentAcidPct')
    const baseDigRate = getStat(newXml, 'BaseDigestionRate') || 25
    const acidRiseRate = getStat(newXml, 'AcidRiseRate') || 10

    const stomachMatch = newXml.match(
      /<Stomach[\s\S]*?>([\s\S]*?)<\/Stomach>/i,
    )
    const stomachContents = stomachMatch ? stomachMatch[1].trim() : ''
    const hasItems = stomachContents.includes('<Item')

    if (hasItems) {
      acidLevel = Math.min(100, acidLevel + acidRiseRate * elapsed)
    } else {
      acidLevel = Math.max(0, acidLevel - acidRiseRate * elapsed)
    }

    const acidMultiplier = 1 + acidLevel / 100

    let updatedXml = newXml.replace(
      /<CurrentAcidPct>.*?<\/CurrentAcidPct>/i,
      `<CurrentAcidPct>${acidLevel.toFixed(2)}</CurrentAcidPct>`,
    )

    let itemCount = 0

    // Pass 1: Normal tags <Item ...>...</Item>
    const itemRegex1 = /<Item\s+([^>]+)>([\s\S]*?)<\/Item>/gi
    updatedXml = updatedXml.replace(
      itemRegex1,
      (match, attrs, inner) => {
        itemCount++
        const type = getAttrFromString(attrs, 'type') || 'Food'
        const name = getAttrFromString(attrs, 'name')
        const vol = getAttrFromString(attrs, 'volume_L')

        let speedMult = 1
        if (type === 'Liquid') speedMult = 3
        else if (type === 'Prey') speedMult = 0.5

        let digNum =
          parseFloat(
            getAttrFromString(attrs, 'digestion').replace('%', ''),
          ) || 0
        const digIncrease =
          baseDigRate * speedMult * acidMultiplier * elapsed
        digNum = Math.min(100, digNum + digIncrease)

        return `<Item type="${type}" name="${name}" volume_L="${vol}" digestion="${digNum.toFixed(2)}%">${inner}</Item>`
      },
    )

    // Pass 2: Self-closing tags <Item ... />
    const itemRegex2 = /<Item\s+([^>]+?)\s*\/>/gi
    updatedXml = updatedXml.replace(itemRegex2, (match, attrs) => {
      itemCount++
      const type = getAttrFromString(attrs, 'type') || 'Food'
      const name = getAttrFromString(attrs, 'name')
      const vol = getAttrFromString(attrs, 'volume_L')

      let speedMult = 1
      if (type === 'Liquid') speedMult = 3
      else if (type === 'Prey') speedMult = 0.5

      let digNum =
        parseFloat(
          getAttrFromString(attrs, 'digestion').replace('%', ''),
        ) || 0
      const digIncrease =
        baseDigRate * speedMult * acidMultiplier * elapsed
      digNum = Math.min(100, digNum + digIncrease)

      return `<Item type="${type}" name="${name}" volume_L="${vol}" digestion="${digNum.toFixed(2)}%" />`
    })

    spindle.log.info(
      `Digestion tick: ${elapsed.toFixed(2)}h elapsed, ` +
        `acid ${acidLevel.toFixed(1)}%, ${itemCount} items processed`,
    )

    return updatedXml
  } catch (e) {
    spindle.log.error(`Digestion tick failed: ${e}`)
    return newXml
  }
}

async function commitUpdate(
  chatId: string,
  messageId: string,
  sheetXml: string,
  chatIndex: number,
) {
  const oldSheet = sheets.get(chatId) || ''
  const finalXml = runDigestionTick(sheetXml, oldSheet)

  await saveChatSheet(chatId, finalXml)
  const list = snapshots.get(chatId) || []
  list.push({ messageId, sheetXml: finalXml, chatIndex })
  snapshots.set(chatId, list)
  await saveChatSnapshots(chatId)

  if (chatId === activeChatId) {
    spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: finalXml })
  }
  spindle.log.info(
    `Sheet committed for message ${messageId} in chat ${chatId}`,
  )
}

async function rollbackOnDelete(chatId: string, messageId: string) {
  const list = snapshots.get(chatId)
  if (!list) return

  const hadSnapshot = list.some((s) => s.messageId === messageId)
  const newList = list.filter((s) => s.messageId !== messageId)
  snapshots.set(chatId, newList)
  committedMessageIds.delete(messageId)

  if (!hadSnapshot) return

  if (newList.length > 0) {
    const latest = newList.reduce((a, b) =>
      a.chatIndex > b.chatIndex ? a : b,
    )
    await saveChatSheet(chatId, latest.sheetXml)
    if (chatId === activeChatId) {
      spindle.sendToFrontend({
        type: 'SHEET_UPDATED',
        xml: latest.sheetXml,
      })
    }
  } else {
    await saveChatSheet(chatId, '')
    if (chatId === activeChatId) {
      spindle.sendToFrontend({ type: 'SHEET_UPDATED', xml: '' })
    }
  }

  await saveChatSnapshots(chatId)
  spindle.log.info(
    `Rolled back in chat ${chatId} after deletion of ${messageId}`,
  )
}

function buildSheetPrompt(sheetXml: string): string {
  return `[CHARACTER SHEET SYSTEM

You are operating with a persistent character sheet tracker. Below is the current state of the character sheet. You must stay aware of these values and act consistently with them.

<CurrentCharacterSheet>
${sheetXml}
</CurrentCharacterSheet>

─── UPDATE INSTRUCTIONS ───

When the character sheet changes during the scene, you MUST include an updated copy of the FULL sheet inside a <sheet_update> block at the very END of your response.

CRITICAL XML RULES:
1. You MUST copy the EXACT XML structure provided in <CurrentCharacterSheet>. Do NOT invent new tags, do NOT change tag names, do NOT change attributes.
2. Clothing MUST be inside <Clothing> using the <Equip slot="..." elasticity="...">...</Equip> format.
   VALID SLOT NAMES ONLY: "Head Top", "Face", "Head Lower", "Neck", "Underwear Top", "Underwear Bottom", "Torso Base", "Torso Mid", "Torso Outer", "Torso Shell", "Hands Base", "Hands Outer", "Legs Base", "Legs Outer", "Feet Base", "Feet Outer", "Jewelry", "Back", "Waist".
3. The <Equip> tag MUST ALWAYS have an elasticity attribute. Valid values are "rigid", "standard", "stretchy", or "magic". Never omit it.
4. Stomach contents MUST be inside <Stomach> using the <Item type="Liquid|Food|Prey" name="..." volume_L="..." digestion="...%"> format. Do not use a <Prey> tag.
5. Prey gear/flavor MUST go inside <Description> and <BoundGear> tags within the <Item type="Prey"> tag.
6. DO NOT calculate digestion percentages yourself. The extension's Metabolic Engine handles all digestion math automatically based on the <Time> you set. You only need to add items to the stomach when eaten, and update the <Time> tag.
7. If prey is fully digested (reaches 100%), you may move their remains to the Bowels section in the next update using the <Remains volume_L="...">...</Remains> format.
8. The <sheet_update> block is invisible to the user — do not mention it in your visible text.
9. If absolutely nothing on the sheet changed, you may omit the block.
10. Always include all sections (State, BaseStats, Clothing, Backpack, SkillsAndTraits, DigestiveTract) even if some are empty.

<sheet_update>
<CharacterSheet>
  ...the complete updated sheet with ALL fields, not just changed ones...
</CharacterSheet>
</sheet_update>]`
}

spindle.onFrontendMessage(async (msg: any) => {
  if (msg.type === 'SYNC_BIO_DATA' && msg.xmlData) {
    if (!activeChatId) {
      spindle.toast.warning('Open a chat first before syncing the sheet.')
      return
    }
    await saveChatSheet(activeChatId, msg.xmlData)
    spindle.log.info(
      `Sheet synced from frontend for chat ${activeChatId}`,
    )
    spindle.toast.success('Character sheet synced!')
  }

  if (msg.type === 'GET_LATEST_SHEET') {
    if (!activeChatId) {
      spindle.toast.warning('Open a chat first.')
      return
    }
    const sheet = sheets.get(activeChatId) || ''
    spindle.sendToFrontend({ type: 'LATEST_SHEET', xml: sheet })
  }
})

spindle.registerInterceptor(async (messages, context) => {
  const ctx = context as any
  const chatId: string = ctx.chatId
  const genType: string = ctx.generationType

  pendingGenerationType = genType

  let sheet = sheets.get(chatId)
  if (sheet === undefined) {
    sheet = (await loadChatSheet(chatId)) || ''
  }

  if (!sheet) return messages

  if (genType === 'normal') {
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
        await commitUpdate(
          chatId,
          lastAssistant.sourceMessageId,
          update,
          chatIndex,
        )
        committedMessageIds.add(lastAssistant.sourceMessageId)
        sheet = sheets.get(chatId) || sheet
      }
    }
  }

  const injection = {
    role: 'system' as const,
    content: buildSheetPrompt(sheet),
  }

  return {
    messages: [injection, ...messages],
    breakdown: [{ messageIndex: 0, name: 'Character Sheet' }],
  }
}, 50)

spindle.on('GENERATION_ENDED', async (payload: any) => {
  spindle.toast.info(`GEN_ENDED: type=${pendingGenerationType}`)

  if (payload.error) {
    spindle.toast.warning('GEN_ENDED: had error')
    return
  }

  const { chatId, messageId, content } = payload
  if (!chatId || !messageId || !content) {
    spindle.toast.warning('GEN_ENDED: missing fields')
    return
  }
  if (chatId !== activeChatId) {
    spindle.toast.warning('GEN_ENDED: wrong chat')
    return
  }
  if (
    pendingGenerationType === 'swipe' ||
    pendingGenerationType === 'regenerate'
  ) {
    spindle.toast.info('GEN_ENDED: skipped (swipe/regenerate)')
    return
  }
  if (committedMessageIds.has(messageId)) {
    spindle.toast.info('GEN_ENDED: already committed')
    return
  }

  const update = extractSheetUpdate(content)
  if (!update) {
    spindle.toast.warning('GEN_ENDED: no sheet_update found')
    return
  }

  const list = snapshots.get(chatId) || []
  const chatIndex = list.length
  await commitUpdate(chatId, messageId, update, chatIndex)
  committedMessageIds.add(messageId)

  spindle.toast.success('Sheet updated — digestion tick applied')
})

spindle.on('CHAT_SWITCHED', async (payload: any) => {
  await switchToChat(payload.chatId)
})

spindle.on('MESSAGE_DELETED', async (payload: any) => {
  const { chatId, messageId } = payload
  if (chatId) await rollbackOnDelete(chatId, messageId)
})

spindle.log.info('Bio Tracker backend loaded (Digestion Engine v3)')
