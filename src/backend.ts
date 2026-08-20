import type { SpindleBackendContext } from 'lumiverse-spindle-types';

let currentCharacterSheetXML = "";

export function setup(ctx: SpindleBackendContext) {
  
  // 1. Listen for the Frontend sending us data
  ctx.onMessage((message) => {
    if (message.type === 'SYNC_BIO_DATA') {
      currentCharacterSheetXML = message.xmlData;
      console.log("=== BACKEND: SUCCESSFULLY RECEIVED XML DATA ===");
      console.log(currentCharacterSheetXML);
    }
  });

  // 2. Intercept the chat request
  ctx.hooks.on('before_generate', async (request) => {
    console.log("=== BACKEND: before_generate triggered ===");
    
    if (currentCharacterSheetXML !== "") {
      const injectionString = `\n\n[SYSTEM NOTE: Absolute mechanical state of the character. Strictly adhere to these values:]\n${currentCharacterSheetXML}`;

      // Let's check what properties request has and inject safely
      if (request && request.messages && Array.isArray(request.messages)) {
        const systemMessage = request.messages.find(m => m.role === 'system');
        if (systemMessage) {
          systemMessage.content += injectionString;
          console.log("=== BACKEND: Injected into existing system message ===");
        } else {
          request.messages.unshift({ role: 'system', content: injectionString });
          console.log("=== BACKEND: Created new system message and injected ===");
        }
      } else {
        console.log("=== BACKEND ERROR: request.messages not found or invalid format ===");
      }
    } else {
      console.log("=== BACKEND WARNING: currentCharacterSheetXML is empty! Did you press Sync? ===");
    }
    
    return request;
  });
}
