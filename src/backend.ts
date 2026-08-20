declare const spindle: import('lumiverse-spindle-types').SpindleAPI;

const STATE_KEY = 'bio_tracker_state';

const defaultState = {
  weight: 60,
  height: 160,
  stomach_current_ml: 0, 
  bowel_current_ml: 0,
  cash: 0,
  inventory: []
};

// Track if we've successfully hooked into the chat
let interceptorRegistered = false;

function tryRegisterInterceptor() {
  if (interceptorRegistered) return;
  
  // If the permission isn't flipped on yet, stop here.
  if (!spindle.permissions.has('interceptor')) return;

  spindle.registerInterceptor(async (messages, ctx) => {
    const state = await spindle.variables.getChat(ctx.chatId, STATE_KEY) || defaultState;

    const capacity_L = ((state.height * state.weight) / 100) * 1.2;
    const capacity_ml = capacity_L * 1000;
    
    let fill_percent = 0;
    if (capacity_ml > 0) {
      fill_percent = Math.round((state.stomach_current_ml / capacity_ml) * 100);
    }

    let belly_status = "Flat (0-5%)";
    let mobility = "Normal";
    if (fill_percent > 160) { belly_status = "Critical"; mobility = "Immobile"; }
    
    const injection = `\n\n[OOC SYSTEM NOTE: The user's current physical state is -> Stomach Capacity: ${capacity_L.toFixed(2)}L | Current Volume: ${state.stomach_current_ml}ml | Status: ${belly_status} | Mobility: ${mobility} | Cash: ${state.cash}]`;

    // Visual proof it fired during generation
    spindle.toast.info("⚙️ Bio-Tracker math engine processed!");

    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
        lastMessage.content += injection;
    }

    return messages;
  });
  
  interceptorRegistered = true;
  spindle.log.info('Bio-Tracker interceptor active.');
  
  // Visual proof that the engine actually woke up!
  spindle.toast.info("✅ Bio-Tracker hooked into chat!");
}

// 1. Try immediately on boot (in case permissions are already on)
tryRegisterInterceptor();

// 2. Listen for you flipping the switch in the settings
spindle.permissions.onChanged(({ permission, granted }) => {
  if (permission === 'interceptor' && granted) {
    tryRegisterInterceptor();
  }
});
