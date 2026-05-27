# All In One Script (Minecraft Bedrock Add-on)

A highly modular, performance-optimized, and fully server-side JavaScript Add-on for Minecraft Bedrock Edition. This pack brings QoL (Quality of Life) improvements, PVP mechanics, and fun interactions to your world without requiring any experimental toggles beyond Beta APIs.

> **Note:** All in-game Action Bar messages, chat logs, and warnings are strictly 100% English.

---

## 🌟 Features Overview

### 1. Advanced Offhand System (`tick.js`)
Bypass Bedrock's strict offhand limitations securely.
* **Double-Sneak Swap:** Double-tap sneak (Shift) to seamlessly swap items between your Mainhand and Offhand.
* **Safe Guard:** Prevents transferring items with custom NameTags, Lore, or Enchantments to avoid NBT data loss.
* **Dynamic Lighting:** Holding a torch or lantern in either hand will illuminate the surroundings as you walk.

### 2. Fast Regeneration (`regen.js`)
Perfect for fast-paced PVP or survival.
* **Out of Combat Regen:** If a player takes no damage for **10 seconds**, they will receive a brief, high-level Regeneration effect to instantly restore full health.
* **Golden Apple Safe:** Uses vanilla potion effects (`regeneration 255` for 1 second) to ensure Absorption hearts from Golden Apples are never overwritten.

### 3. Smart Sitting (`sit.js`)
Sit anywhere, anytime.
* **Mechanic:** Right-click on any **Stair** or **Slab** block to instantly sit on it.
* **BeforeEvents Magic:** You can hold a block in your hand while right-clicking to sit! The script perfectly cancels the block-placement event so you don't accidentally build on your chair.
* **Dismount:** Simply press Sneak (Shift) or Jump to stand up. The invisible mount will be instantly cleared.

### 4. Crazy Items (`crazy.js`)
Chaos and fun for the server. (Prioritizes Mainhand over Offhand).
* **Lightning Rod Smite:** Right-click with any variant of a Lightning Rod to summon a lightning bolt at your crosshair (Max range: 40 blocks). 
* **Bedwars KB Stick:** Attacking players with a normal Stick applies a massive Knockback multiplier (Horizontal 2.2x, Vertical 0.5x).
* **Questionable Diet:** Any item renamed in an anvil to contain keywords like `eat`, `heart`, `brain`, `flesh`, etc., can be consumed for a burst of Regeneration and Nausea.

### 5. Combat & Death Enhancements (`combat.js` & `death.js`)
* **Dynamic HP Display:** Hitting an entity updates their NameTag to display their exact remaining HP. 
* **Custom Death Messages:** Replaces boring vanilla death messages with custom, randomized PVP/PVE callouts (e.g., "*Player was sent to the lobby by Zombie*").

### 6. Quick Interactions (`harvest.js` & `interact.js`)
* **Right-Click Harvest:** Right-click fully grown crops with a Hoe to automatically harvest and replant them, consuming 1 durability.
* **Enhanced Milking:** Supports milking cows directly with bowls for mushroom stew (visual/audio enhancements included).

---

## 🛠️ Installation & Developer Notes

1. Place the folder into your `development_behavior_packs` directory.
2. Enable **Beta APIs** in your world settings.
3. Apply the Behavior Pack to your world.

### ⚠️ Bedrock Engine Quirks (Troubleshooting)
* **`/reload` Command Limits:** The `/reload` command in-game is fantastic for updating existing `.js` files. However, it **cannot** detect newly created files (e.g., adding a new script or JSON file). If you create a new file, you MUST Save & Quit to the main menu and re-enter the world for the engine to cache it.
* **World Cache Trap:** If you modify scripts in `development_behavior_packs` but the game isn't updating, Minecraft might have copied the pack into the specific world's `behavior_packs` folder. Deactivate and Reactivate the pack in the world settings to force a fresh copy.

---
**Version:** 1.0.0 | **API:** `@minecraft/server`