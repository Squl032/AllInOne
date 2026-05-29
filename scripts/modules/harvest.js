import { world, system, EquipmentSlot, ItemComponentTypes, ItemStack } from "@minecraft/server";

const harvestCooldown = new Map();

// 🌟 輔助函數：抓取工具上的時運等級
function getFortuneLevel(item) {
    if (!item) return 0;
    try {
        const enchants = item.getComponent(ItemComponentTypes.Enchantable) || item.getComponent("minecraft:enchantable");
        if (enchants) {
            const fortune = enchants.getEnchantment("fortune") || enchants.getEnchantment("minecraft:fortune");
            if (fortune) return fortune.level;
        }
    } catch (e) { }
    return 0;
}

// 🌟 輔助函數：自定義掉落物算式 (打破原版智障限制，讓小麥也能時運翻倍)
function spawnCustomLoot(dimension, loc, typeId, fortuneLevel) {
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const extra = rand(0, fortuneLevel); // 根據時運等級決定額外掉落量

    let drops = [];
    if (typeId === "minecraft:wheat") {
        drops.push({ id: "minecraft:wheat", count: 1 + extra }); // 小麥本體也受時運加成！
        drops.push({ id: "minecraft:wheat_seeds", count: rand(1, 2) + extra });
    } else if (typeId === "minecraft:beetroot") {
        drops.push({ id: "minecraft:beetroot", count: 1 + extra });
        drops.push({ id: "minecraft:beetroot_seeds", count: rand(1, 2) + extra });
    } else if (typeId === "minecraft:carrots") {
        drops.push({ id: "minecraft:carrot", count: rand(1, 4) + extra });
    } else if (typeId === "minecraft:potatoes") {
        drops.push({ id: "minecraft:potato", count: rand(1, 4) + extra });
        // 原版毒馬鈴薯機率約 2%，不受時運影響
        if (Math.random() < 0.02) drops.push({ id: "minecraft:poisonous_potato", count: 1 });
    }

    // 將計算好的物品噴出
    for (const drop of drops) {
        if (drop.count > 0) {
            try {
                dimension.spawnItem(new ItemStack(drop.id, drop.count), loc);
            } catch (e) { }
        }
    }
}

export function registerHarvestSystem() {
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const player = event.player;
        const block = event.block;

        // 防連點冷卻 (250ms)
        const now = Date.now();
        if (harvestCooldown.has(player.id) && now - harvestCooldown.get(player.id) < 250) {
            return;
        }

        const equippable = player.getComponent("equippable");
        if (!equippable) return;

        const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
        const offSlot = equippable.getEquipmentSlot(EquipmentSlot.Offhand);

        const mainItem = mainSlot.getItem();
        const offItem = offSlot.getItem();

        let activeSlot = null;
        let activeItem = null;

        if (mainItem && mainItem.typeId.includes("hoe")) {
            activeSlot = mainSlot;
            activeItem = mainItem;
        }
        else if (offItem && offItem.typeId.includes("hoe")) {
            activeSlot = offSlot;
            activeItem = offItem;
        }

        if (activeItem) {
            const type = block.typeId;
            const cropStates = {
                "minecraft:wheat": { maxGrowth: 7 },
                "minecraft:carrots": { maxGrowth: 7 },
                "minecraft:potatoes": { maxGrowth: 7 },
                "minecraft:beetroot": { maxGrowth: 7 }
            };

            if (type in cropStates) {
                const cropData = cropStates[type];

                let growthState;
                try {
                    growthState = block.permutation.getState("growth");
                } catch (e) { return; }

                if (growthState === cropData.maxGrowth) {
                    event.cancel = true;
                    harvestCooldown.set(player.id, now);

                    const loc = block.location;
                    const dimension = player.dimension;

                    // 抓取鋤頭上的時運等級
                    const fortuneLevel = getFortuneLevel(activeItem);

                    system.run(() => {
                        // 1. 扣除耐久度
                        const durability = activeItem.getComponent(ItemComponentTypes.Durability) || activeItem.getComponent("minecraft:durability");
                        if (durability) {
                            if (durability.damage + 1 >= durability.maxDurability) {
                                activeSlot.setItem(undefined);
                                player.playSound("random.break");
                            } else {
                                durability.damage += 1;
                                activeSlot.setItem(activeItem);
                            }
                        }

                        // 2. 播放音效並補種
                        player.playSound("dig.crop", { location: loc });
                        block.setPermutation(block.permutation.withState("growth", 0));

                        // 3. 呼叫我們自製的「真．時運掉落」系統！
                        spawnCustomLoot(dimension, loc, type, fortuneLevel);
                    });
                }
            }
        }
    });
}