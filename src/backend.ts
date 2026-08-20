import type { SpindleBackendContext } from 'lumiverse-spindle-types';

// This variable will hold our XML string in memory
let currentCharacterSheetXML = "";

export function setup(ctx: SpindleBackendContext) {
  
  // 1. Listen for the Frontend sending us the new XML data
  ctx.onMessage((message) => {
    if (message.type === 'SYNC_BIO_DATA') {
      currentCharacterSheetXML = message.xmlData;
      console.log("Backend received new Character Sheet XML!");
    }
  });

  // 2. Intercept the chat request right before it goes to the AI
  ctx.hooks.on('before_generate', async (request) => {
    
    // If we have data synced, inject it!
    if (currentCharacterSheetXML !== "") {
      
      // We wrap it in a strict system instruction so the AI knows how to handle it
      const injectionString = `
[SYSTEM NOTE: Below is the absolute, current mechanical state of the user's character and digestive tract. You must strictly adhere to these physical limits, items, and capacities in your next response. Do not hallucinate items not in this inventory.]
${currentCharacterSheetXML}
`;

      // Find the System Prompt (usually the first message in the array) and append our data
      const systemMessage = request.messages.find(m => m.role === 'system');
      if (systemMessage) {
        systemMessage.content += '\n\n' + injectionString;
      } else {
        // If there isn't a system message for some reason, we add one
        request.messages.unshift({ role: 'system', content: injectionString });
      }
    }
    
    return request;
  });
}
