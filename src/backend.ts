declare const spindle: import('lumiverse-spindle-types').SpindleAPI;

const STATE_KEY = 'bio_tracker_state';

// 1. The Default Character Template
const defaultState = {
  weight: 60, // base weight in kg
  height: 160, // base height in cm
  stomach_current_ml: 0, 
  bowel_current_ml: 0,
  cash: 0,
  inventory: []
};

// 2. The Startup Check
if (!spindle.permissions.has('interceptor')) {
  spindle.log.warn('Bio-Tracker requires the "interceptor" permission.');
}

// 3. The Prompt Interceptor (The Injection Engine)
if (spindle.permissions.has('interceptor')) {
  spindle.registerInterceptor(async (messages, ctx) => {
    
    // Fetch the chat's specific stats, or use the default if starting a new chat
    const state = await spindle.variables.getChat(ctx.chatId, STATE_KEY) || defaultState;

    // Run your exact formulas
    const capacity_L = ((state.height * state.weight) / 100) * 1.2;
    const capacity_ml = capacity_L * 1000;
    
    // Calculate the percentage
    let fill_percent = 0;
    if (capacity_ml > 0) {
      fill_percent = Math.round((state.stomach_current_ml / capacity_ml) * 100);
    }

    // Dynamic Belly Size Chart
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
    
// Build the silent injection string
    const injection = `[SYSTEM BIO-TRACKER DATA]\n- Stomach Capacity: ${capacity_L.toFixed(2)}L\n- Current Volume: ${state.stomach_current_ml}ml\n- Status: ${belly_status}\n- Mobility Penalty: ${mobility}\n- Cash: ${state.cash}`;

    // Force inject as a brand new system message to guarantee the AI reads it
    messages.push({
      role: 'system',
      content: injection
    });

    return messages;
  });
  
  spindle.log.info('Bio-Tracker interceptor active.');
}
