import type { SpindleBackendContext } from 'lumiverse-spindle-types';

let currentCharacterSheetXML = "";

export function setup(ctx: SpindleBackendContext) {
  
  // Listen for the sync from the frontend
  ctx.onMessage((message) => {
    if (message.type === 'SYNC_BIO_DATA') {
      currentCharacterSheetXML = message.xmlData;
    }
  });

  // Intercept the chat request
  ctx.hooks.on('before_generate', async (request) => {
    
    // If the XML is empty, just let the message go through normally
    if (!currentCharacterSheetXML) return request;

    const injectionString = `\n\n[SYSTEM NOTE: The following is the absolute, mechanical state of the user's character, inventory, and biological vitals. You must strictly adhere to these limits and contents in your response.]\n${currentCharacterSheetXML}`;

    // SCENARIO 1: OpenAI / API Format (request.body.messages)
    if (request.body && Array.isArray(request.body.messages)) {
      const sysMsg = request.body.messages.find((m: any) => m.role === 'system');
      if (sysMsg) sysMsg.content += injectionString;
      else request.body.messages.unshift({ role: 'system', content: injectionString });
    }
    // SCENARIO 2: Flat Array Format (request.messages)
    else if (Array.isArray(request.messages)) {
      const sysMsg = request.messages.find((m: any) => m.role === 'system');
      if (sysMsg) sysMsg.content += injectionString;
      else request.messages.unshift({ role: 'system', content: injectionString });
    }
    // SCENARIO 3: Raw Text Prompt (request.prompt)
    else if (request.prompt) {
      request.prompt = injectionString + "\n\n" + request.prompt;
    }
    // SCENARIO 4: Raw Text Prompt in Body (request.body.prompt)
    else if (request.body && request.body.prompt) {
      request.body.prompt = injectionString + "\n\n" + request.body.prompt;
    }
    
    return request;
  });
}
    return request;
  });
}
