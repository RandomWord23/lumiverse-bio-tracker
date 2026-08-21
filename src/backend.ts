import type { SpindleBackendContext } from 'lumiverse-spindle-types';

let currentCharacterSheetXML = "";

export function setup(ctx: SpindleBackendContext) {
  
  // Listen for the sync from the frontend
  ctx.onMessage((message) => {
    if (message.type === 'SYNC_BIO_DATA') {
      currentCharacterSheetXML = message.xmlData;
    }
  });

  // Intercept the chat request safely
  ctx.hooks.on('before_generate', async (request: any) => {
    
    // If the XML is empty, let it pass normally
    if (!currentCharacterSheetXML || currentCharacterSheetXML === "") return request;

    const injectionString = "\n\n[SYSTEM NOTE: The following is the absolute mechanical state of the user's character. You must adhere to these limits and contents.]\n" + currentCharacterSheetXML;

    // Check Format 1: request.messages (Flat Array)
    if (request.messages && Array.isArray(request.messages)) {
        let systemMessage = request.messages.find((m: any) => m.role === 'system');
        if (systemMessage) {
            systemMessage.content += injectionString;
        } else {
            request.messages.unshift({ role: 'system', content: injectionString });
        }
    } 
    // Check Format 2: request.body.messages (OpenAI/Anthropic Style)
    else if (request.body && request.body.messages && Array.isArray(request.body.messages)) {
        let systemMessage = request.body.messages.find((m: any) => m.role === 'system');
        if (systemMessage) {
            systemMessage.content += injectionString;
        } else {
            request.body.messages.unshift({ role: 'system', content: injectionString });
        }
    } 
    // Check Format 3: Raw text prompt
    else if (typeof request.prompt === 'string') {
        request.prompt = injectionString + "\n\n" + request.prompt;
    }

    return request;
  });
}
