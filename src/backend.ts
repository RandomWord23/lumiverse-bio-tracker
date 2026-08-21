import type { SpindleBackendContext } from 'lumiverse-spindle-types';

let currentCharacterSheetXML = "";

export function setup(ctx: SpindleBackendContext) {
  
  // 1. Listen for the XML from the frontend
  ctx.onMessage((message) => {
    if (message.type === 'SYNC_BIO_DATA') {
      currentCharacterSheetXML = message.xmlData;
    }
  });

  // 2. Intercept the chat request
  ctx.hooks.on('before_generate', async (request: any) => {
    
    if (!currentCharacterSheetXML || currentCharacterSheetXML === "") return request;

    const injectionString = "\n\n[SYSTEM OVERRIDE: The following is the absolute mechanical state of the user's character. You MUST adhere to these limits, items, and biological states in your next response.]\n" + currentCharacterSheetXML;

    // Recursive function to hunt down the messages array anywhere in the request
    function injectIntoMessages(obj: any): boolean {
      if (!obj || typeof obj !== 'object') return false;

      // Did we find the messages array?
      if (Array.isArray(obj.messages)) {
        
        // NUCLEAR OPTION: Find the LAST user message and attach it there so the AI cannot forget it.
        const lastUserIndex = obj.messages.map((m: any) => m.role).lastIndexOf('user');
        
        if (lastUserIndex !== -1) {
          obj.messages[lastUserIndex].content += injectionString;
          return true;
        }
        
        // Fallback: Put it in the system prompt
        const sysMsg = obj.messages.find((m: any) => m.role === 'system');
        if (sysMsg) {
          sysMsg.content += injectionString;
          return true;
        }
        
        // Fallback 2: Make a new system prompt
        obj.messages.unshift({ role: 'system', content: injectionString });
        return true;
      }

      // Keep digging deeper into the object
      for (const key of Object.keys(obj)) {
        if (injectIntoMessages(obj[key])) return true;
      }
      return false;
    }

    const injected = injectIntoMessages(request);

    // Ultimate fallback for raw text completion APIs
    if (!injected) {
      if (typeof request.prompt === 'string') {
        request.prompt += injectionString;
      } else if (request.body && typeof request.body.prompt === 'string') {
        request.body.prompt += injectionString;
      }
    }

    return request;
  });
}
