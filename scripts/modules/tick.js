import { world, system, EquipmentSlot, ItemComponentTypes } from "@minecraft/server";

const dynamicLights = new Map();
const playerStates = new Map();
const kissCooldown = new Map(); // 這裡將轉為儲存雙人互動狀態物件 { lastHeartTime, wasTouching }

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

            // 🌟 核心紀錄：在狀態被覆蓋前，精準捕捉 P1 是否「剛按下蹲下」的瞬間
            const p1JustSneaked = isSneaking && !state.isSneaking;

            // --- A. Double-Sneak Offhand Swap (Guard Clause Version) ---
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
                            p1.runCommandAsync(`replaceitem entity @s slot.weapon.offhand 0 ${mainItem.typeId} ${mainItem.amount} ${damage}`).catch(() => {
                                p1.runCommandAsync(`item replace entity @s slot.weapon.offhand 0 with ${mainItem.typeId} ${mainItem.amount}`).catch(() => { });
                            });
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

            // --- C. Double Sneak Kiss (🌟 終極狂按與前後狂蹭版) ---
            for (let j = i + 1; j < players.length; j++) {
                const p2 = players[j];
                const p2Id = p2.id;

                // 計算兩人的即時距離
                const dx = p1.location.x - p2.location.x;
                const dy = p1.location.y - p2.location.y;
                const dz = p1.location.z - p2.location.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const isTouching = distance < 1.2; // 判定範圍

                const pairId = `${p1Id}-${p2Id}`;
                if (!kissCooldown.has(pairId)) {
                    kissCooldown.set(pairId, { lastHeartTime: 0, wasTouching: false });
                }
                const pairState = kissCooldown.get(pairId);

                // 當兩人都處於蹲下狀態且貼在一起時，才觸發愛心邏輯
                if (isSneaking && p2.isSneaking && isTouching) {
                    // 獲取 P2 上一次的狀態，判定 P2 是否也是剛剛按下蹲下
                    const p2State = playerStates.get(p2Id);
                    const p2JustSneaked = p2.isSneaking && !(p2State?.isSneaking);

                    // 判定兩人是否為「剛碰到彼此」的瞬間 (前前後後狂蹭)
                    const justTouched = isTouching && !pairState.wasTouching;

                    let shouldSpawnHeart = false;

                    // 1. 有人一直 Spam 蹲下 (任何一方剛按蹲下)
                    // 2. 有人前前後後走動 (剛碰觸到彼此)
                    if (p1JustSneaked || p2JustSneaked || justTouched) {
                        shouldSpawnHeart = true;
                    }
                    // 3. 兩人保持蹲下且黏在一起 (保持固定的冒愛心頻率，此處設為 800 毫秒)
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

                // 持續在每 Tick 更新碰觸歷史狀態，確保「前前後後」的判定百分之百精準
                pairState.wasTouching = isTouching;
            }
        }
    }, 2);
}