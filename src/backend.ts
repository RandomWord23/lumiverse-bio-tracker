declare const spindle: import('lumiverse-spindle-types').SpindleAPI;

let interceptorRegistered = false;

function tryRegisterInterceptor() {
  if (interceptorRegistered) return;
  if (!spindle.permissions.has('interceptor')) return;

  spindle.registerInterceptor(async (messages, ctx) => {
    // 1. Put the notification at the VERY TOP so we know it triggered
    spindle.toast.info("⚙️ Interceptor fired!");
    
    try {
      // 2. Hardcode a basic test string
      const injection = "\n\n[OOC SYSTEM NOTE: The user's Stomach Capacity is 115L and they are heavily bloated.]";
      
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
          lastMessage.content += injection;
      }
    } catch (error) {
      // 3. If it crashes, tell us EXACTLY why on the screen
      spindle.toast.error("Crash: " + String(error));
    }

    return messages;
  });
  
  interceptorRegistered = true;
  spindle.toast.info("✅ Interceptor successfully registered!");
}

tryRegisterInterceptor();

spindle.permissions.onChanged(({ permission, granted }) => {
  if (permission === 'interceptor' && granted) {
    tryRegisterInterceptor();
  }
});
