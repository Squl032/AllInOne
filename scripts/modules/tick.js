import { world, system, EquipmentSlot, ItemComponentTypes } from "@minecraft/server";

const dynamicLights = new Map();
const playerStates = new Map();
const kissCooldown = new Map();

// --- 守門員：檢查物品是否帶有特殊屬性 (名稱/Lore/附魔) ---
function hasUnsafeProperties(item) {
    if (!item) return false;

    // 1. 檢查是否有自訂命名
    if (item.nameTag) return true;

    // 2. 檢查是否有 Lore (物品描述)
    if (item.getLore().length > 0) return true;

    // 3. 檢查是否有附魔
    try {
        const enchants = item.getComponent(ItemComponentTypes.Enchantable);
        // 相容不同版本的 API 寫法
        if (enchants) {
            const enchData = enchants.getEnchantments();
            if (enchData && enchData.length > 0) return true; // 陣列格式
            if (enchData && enchData.slot !== undefined && !enchData.isEmpty) return true; // 物件格式
        }
    } catch (e) { }

    return false;
}

export function startTickLoop() {
    system.runInterval(() => {
        const players = world.getAllPlayers();
        const now = Date.now();

        for (let i = 0; i < players.length; i++) {
            const p1 = players[i];
            const equippable = p1.getComponent("equippable");
            if (!equippable) continue;

            const p1Id = p1.id;
            const state = playerStates.get(p1Id) || { isSneaking: false, lastSneakTime: 0 };
            const isSneaking = p1.isSneaking;

            // --- A. Double-Sneak Offhand Swap (Guard Clause Version) ---
            if (isSneaking && !state.isSneaking) {
                if (now - state.lastSneakTime < 350) {
                    const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
                    const offSlot = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
                    const mainItem = mainSlot.getItem();
                    const offItem = offSlot.getItem();

                    // 檢查主手物品是否安全
                    if (mainItem && hasUnsafeProperties(mainItem)) {
                        p1.onScreenDisplay.setActionBar("§7Couldn't transfer item with nametag/enchantment/nbt§r");
                    } else {
                        // 取得物品耐久度 (如果有)
                        let damage = 0;
                        if (mainItem) {
                            const durComp = mainItem.getComponent(ItemComponentTypes.Durability);
                            if (durComp) damage = durComp.damage;
                        }

                        // 1. 把副手的東西安穩地放回主手 (使用 API，保證不吃掉副手物品的附魔)
                        mainSlot.setItem(offItem);

                        // 2. 把主手的普通物品硬塞進副手 (使用指令)
                        if (mainItem) {
                            // 嘗試執行 /replaceitem，並將耐久度數值傳遞進去
                            p1.runCommandAsync(`replaceitem entity @s slot.weapon.offhand 0 ${mainItem.typeId} ${mainItem.amount} ${damage}`).catch(() => {
                                // 如果伺服器版本較新，移除了 replaceitem，則 fallback 到新版指令
                                p1.runCommandAsync(`item replace entity @s slot.weapon.offhand 0 with ${mainItem.typeId} ${mainItem.amount}`).catch(() => { });
                            });
                        } else {
                            // 如果主手本來就是空的，直接清空副手即可
                            offSlot.setItem(undefined);
                        }

                        p1.playSound("armor.equip_generic");
                    }

                    state.lastSneakTime = 0;
                } else {
                    state.lastSneakTime = now;
                }
            }
            state.isSneaking = isSneaking;
            playerStates.set(p1Id, state);

            // --- B. Dynamic Lighting ---
            const mainItem = equippable.getEquipmentSlot(EquipmentSlot.Mainhand).getItem();
            const offItem = equippable.getEquipmentSlot(EquipmentSlot.Offhand).getItem();

            const isHoldingLight = (mainItem && (mainItem.typeId.includes("torch") || mainItem.typeId.includes("lantern"))) ||
                (offItem && (offItem.typeId.includes("torch") || offItem.typeId.includes("lantern")));

            const blockLoc = { x: Math.floor(p1.location.x), y: Math.floor(p1.location.y + 1), z: Math.floor(p1.location.z) };
            const posKey = `${blockLoc.x},${blockLoc.y},${blockLoc.z}`;
            const lastLight = dynamicLights.get(p1Id);

            if (isHoldingLight) {
                if (!lastLight || lastLight.key !== posKey) {
                    if (lastLight) {
                        const oldBlock = p1.dimension.getBlock(lastLight.loc);
                        if (oldBlock && oldBlock.typeId === "minecraft:light_block") oldBlock.setType("minecraft:air");
                    }
                    const currentBlock = p1.dimension.getBlock(blockLoc);
                    if (currentBlock && currentBlock.isAir) {
                        currentBlock.setType("minecraft:light_block");
                        dynamicLights.set(p1Id, { key: posKey, loc: blockLoc });
                    }
                }
            } else if (lastLight) {
                const oldBlock = p1.dimension.getBlock(lastLight.loc);
                if (oldBlock && oldBlock.typeId === "minecraft:light_block") oldBlock.setType("minecraft:air");
                dynamicLights.delete(p1Id);
            }

            // --- C. Double Sneak Kiss ---
            if (isSneaking) {
                for (let j = i + 1; j < players.length; j++) {
                    const p2 = players[j];
                    if (!p2.isSneaking) continue;

                    const dx = p1.location.x - p2.location.x;
                    const dy = p1.location.y - p2.location.y;
                    const dz = p1.location.z - p2.location.z;
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    if (distance < 1.2) {
                        const pairId = `${p1Id}-${p2.id}`;
                        if (!kissCooldown.has(pairId) || now - kissCooldown.get(pairId) > 2000) {
                            kissCooldown.set(pairId, now);
                            p1.dimension.spawnParticle("minecraft:heart_particle", {
                                x: (p1.location.x + p2.location.x) / 2,
                                y: ((p1.location.y + p2.location.y) / 2) + 1.5,
                                z: (p1.location.z + p2.location.z) / 2
                            });
                            p1.dimension.playSound("random.pop", p1.location, { pitch: 1.5, volume: 0.5 });
                        }
                    }
                }
            }
        }
    }, 2);
}