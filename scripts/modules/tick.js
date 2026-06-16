import { world, system, EquipmentSlot, ItemComponentTypes } from "@minecraft/server";

const dynamicLights = new Map();
const playerStates = new Map();
const kissCooldown = new Map();

// --- 守門員：檢查物品是否帶有特殊屬性 (名稱/Lore/附魔) ---
function hasUnsafeProperties(item) {
    if (!item) return false;
    if (item.nameTag) return true;
    if (item.getLore().length > 0) return true;
    try {
        const enchants = item.getComponent(ItemComponentTypes.Enchantable);
        if (enchants) {
            const enchData = enchants.getEnchantments();
            if (enchData && enchData.length > 0) return true;
            if (enchData && enchData.slot !== undefined && !enchData.isEmpty) return true;
        }
    } catch (e) { }
    return false;
}

// 🌟 全新系統：專門獵殺 Reload 與斷線殘留的「幽靈光源」
function clearGhostLights(player, keepKey = null) {
    const tags = player.getTags();
    for (const tag of tags) {
        if (tag.startsWith("lightLoc:")) {
            // 如果這個標籤是我們現在正站著的位置，保留它
            if (keepKey && tag === `lightLoc:${keepKey}`) continue;

            const parts = tag.split(":");
            if (parts.length === 4) {
                const x = parseInt(parts[1], 10);
                const y = parseInt(parts[2], 10);
                const z = parseInt(parts[3], 10);
                try {
                    const block = player.dimension.getBlock({ x, y, z });
                    if (block && block.typeId.includes("light_block")) {
                        block.setType("minecraft:air");
                    }
                } catch (e) { }
            }
            // 摧毀方塊後，將這個過期的座標標籤從玩家身上撕除
            player.removeTag(tag);
        }
    }
}

export function startTickLoop() {
    system.runInterval(() => {
        const players = world.getAllPlayers();
        const now = Date.now();

        for (let i = 0; i < players.length; i++) {
            const p1 = players[i];

            if (!p1 || !p1.isValid) continue;

            const equippable = p1.getComponent("equippable");
            if (!equippable) continue;

            const p1Id = p1.id;
            const state = playerStates.get(p1Id) || { isSneaking: false, lastSneakTime: 0 };
            const isSneaking = p1.isSneaking;
            const p1JustSneaked = isSneaking && !state.isSneaking;

            // --- A. Double-Sneak Offhand Swap ---
            if (isSneaking && !state.isSneaking) {
                if (now - state.lastSneakTime < 350) {
                    const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
                    const offSlot = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
                    const mainItem = mainSlot.getItem();
                    const offItem = offSlot.getItem();

                    if (mainItem && hasUnsafeProperties(mainItem)) {
                        p1.onScreenDisplay.setActionBar("§7Couldn't transfer item with nametag/enchantment/nbt§r");
                    } else {
                        let damage = 0;
                        if (mainItem) {
                            const durComp = mainItem.getComponent(ItemComponentTypes.Durability);
                            if (durComp) damage = durComp.damage;
                        }

                        mainSlot.setItem(offItem);

                        if (mainItem) {
                            try {
                                p1.runCommand(`replaceitem entity @s slot.weapon.offhand 0 ${mainItem.typeId} ${mainItem.amount} ${damage}`);
                            } catch (e1) {
                                try {
                                    p1.runCommand(`item replace entity @s slot.weapon.offhand 0 with ${mainItem.typeId} ${mainItem.amount}`);
                                } catch (e2) { }
                            }
                        } else {
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

            // --- B. Dynamic Lighting (🌟 標籤除錯防禦版) ---
            const mainItem = equippable.getEquipmentSlot(EquipmentSlot.Mainhand).getItem();
            const offItem = equippable.getEquipmentSlot(EquipmentSlot.Offhand).getItem();

            const isHoldingLight = (mainItem && (mainItem.typeId.includes("torch") || mainItem.typeId.includes("lantern"))) ||
                (offItem && (offItem.typeId.includes("torch") || offItem.typeId.includes("lantern")));

            const blockLoc = { x: Math.floor(p1.location.x), y: Math.floor(p1.location.y + 1), z: Math.floor(p1.location.z) };
            const posKey = `${blockLoc.x},${blockLoc.y},${blockLoc.z}`;
            const tagKey = `${blockLoc.x}:${blockLoc.y}:${blockLoc.z}`;
            const lastLight = dynamicLights.get(p1Id);

            if (isHoldingLight) {
                // 如果位置改變，或者剛 Reload 後發現記憶體空了
                if (!lastLight || lastLight.key !== posKey) {

                    // 1. 清理身上所有不屬於現在位置的幽靈光標籤
                    clearGhostLights(p1, tagKey);

                    // 2. 放置新光
                    try {
                        const currentBlock = p1.dimension.getBlock(blockLoc);
                        if (currentBlock && (currentBlock.typeId === "minecraft:air" || currentBlock.typeId === "minecraft:cave_air")) {
                            currentBlock.setType("minecraft:light_block_15");
                            dynamicLights.set(p1Id, { key: posKey, loc: blockLoc });

                            // 貼上新標籤當作保險，就算伺服器這秒當機，下次上線也能清掉
                            p1.addTag(`lightLoc:${tagKey}`);
                        } else {
                            // 如果這個位置不能放光(例如有水)，把記憶體清掉，讓它下一格重新判定
                            dynamicLights.delete(p1Id);
                        }
                    } catch (e) { }
                }
            } else {
                // 手上沒拿燈：啟動終極清理，銷毀所有光塊與標籤
                clearGhostLights(p1);
                dynamicLights.delete(p1Id);
            }

            // --- C. Double Sneak Kiss ---
            for (let j = i + 1; j < players.length; j++) {
                const p2 = players[j];
                if (!p2 || !p2.isValid) continue;

                const p2Id = p2.id;
                const dx = p1.location.x - p2.location.x;
                const dy = p1.location.y - p2.location.y;
                const dz = p1.location.z - p2.location.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const isTouching = distance < 1.2;

                const pairId = `${p1Id}-${p2Id}`;
                if (!kissCooldown.has(pairId)) {
                    kissCooldown.set(pairId, { lastHeartTime: 0, wasTouching: false });
                }
                const pairState = kissCooldown.get(pairId);

                if (isSneaking && p2.isSneaking && isTouching) {
                    const p2State = playerStates.get(p2Id);
                    const p2JustSneaked = p2.isSneaking && !(p2State?.isSneaking);
                    const justTouched = isTouching && !pairState.wasTouching;

                    let shouldSpawnHeart = false;

                    if (p1JustSneaked || p2JustSneaked || justTouched) {
                        shouldSpawnHeart = true;
                    }
                    else if (now - pairState.lastHeartTime > 800) {
                        shouldSpawnHeart = true;
                    }

                    if (shouldSpawnHeart) {
                        pairState.lastHeartTime = now;
                        try {
                            p1.dimension.spawnParticle("minecraft:heart_particle", {
                                x: (p1.location.x + p2.location.x) / 2,
                                y: ((p1.location.y + p2.location.y) / 2) + 1.5,
                                z: (p1.location.z + p2.location.z) / 2
                            });
                            p1.dimension.playSound("random.pop", p1.location, { pitch: 1.5, volume: 0.5 });
                        } catch (e) { }
                    }
                }

                pairState.wasTouching = isTouching;
            }
        }
    }, 2);
}