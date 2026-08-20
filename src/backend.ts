declare const spindle: import('lumiverse-spindle-types').SpindleAPI;

// The local memory map - this holds the stats for every chat!
const chatStates = new Map<string, any>();

const defaultState = {
  weight: 60,
  height: 160,
  stomach_current_ml: 0, 
  bowel_current_ml: 0,
  cash: 0,
  inventory: []
};

let interceptorRegistered = false;

function tryRegisterInterceptor() {
  if (interceptorRegistered) return;
  if (!spindle.permissions.has('interceptor')) return;

  spindle.registerInterceptor(async (messages, ctx) => {
    
    // 1. Get the state for this specific chat, or create it if it's new
    let state = chatStates.get(ctx.chatId);
    if (!state) {
      state = { ...defaultState };
      chatStates.set(ctx.chatId, state);
    }

    // 2. The Math Engine
    const capacity_L = ((state.height * state.weight) / 100) * 1.2;
    const capacity_ml = capacity_L * 1000;
    
    let fill_percent = 0;
    if (capacity_ml > 0) {
      fill_percent = Math.round((state.stomach_current_ml / capacity_ml) * 100);
    }

    let belly_status = "Flat (0-5%)";
    let mobility = "Normal";
    if (fill_percent > 160) { belly_status = "Critical"; mobility = "Immobile"; }
    else if (fill_percent >= 126) { belly_status = "Strained"; mobility = "Crawl only"; }
    else if (fill_percent >= 96) { belly_status = "Overfull"; mobility = "Half speed, stumbles"; }
    else if (fill_percent >= 61) { belly_status = "Same-Size"; mobility = "Slowed, clumsy"; }
    else if (fill_percent >= 49) { belly_status = "Triplets"; }
    else if (fill_percent >= 36) { belly_status = "Twins"; }
    else if (fill_percent >= 21) { belly_status = "Full-Term"; }
    else if (fill_percent >= 13) { belly_status = "Bloated"; }
    else if (fill_percent >= 6) { belly_status = "Potbelly"; }
    
    const injection = `\n\n[OOC SYSTEM NOTE: The user's current physical state is -> Stomach Capacity: ${capacity_L.toFixed(2)}L | Current Volume: ${state.stomach_current_ml}ml | Status: ${belly_status} | Mobility: ${mobility} | Cash: ${state.cash}]`;

    // 3. Attach it to your message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
        lastMessage.content += injection;
    }

    spindle.toast.info("⚙️ Bio-Tracker math engine processed!");
    return messages;
  });
  
  interceptorRegistered = true;
  spindle.toast.info("✅ Bio-Tracker hooked into chat!");
}

tryRegisterInterceptor();

spindle.permissions.onChanged(({ permission, granted }) => {
  if (permission === 'interceptor' && granted) {
    tryRegisterInterceptor();
  }
});
