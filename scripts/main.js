import { initializeSystem } from "./modules/init.js";
import { startTickLoop } from "./modules/tick.js";
import { registerHarvestSystem } from "./modules/harvest.js";
import { registerInteractSystem } from "./modules/interact.js";
import { registerCombatSystem } from "./modules/combat.js";
import { registerDeathSystem } from "./modules/death.js";
import { registerCrazySystem } from "./modules/crazy.js";
import { registerSitSystem } from "./modules/sit.js";
import { registerRegenSystem } from "./modules/regen.js";

initializeSystem();

startTickLoop();
registerHarvestSystem();
registerInteractSystem();
registerCombatSystem();
registerDeathSystem();
registerCrazySystem();
registerSitSystem();
registerRegenSystem();