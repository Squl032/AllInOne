import { world, EquipmentSlot, ItemStack } from "@minecraft/server";

export function registerHarvestSystem() {
    world.afterEvents.playerInteractWithBlock.subscribe((event) => {
        const player = event.player;
        const block = event.block;
        const equippable = player.getComponent("equippable");
        if (!equippable) return;

        const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
        const offSlot = equippable.getEquipmentSlot(EquipmentSlot.Offhand);

        const mainItem = mainSlot.getItem();
        const offItem = offSlot.getItem();

        let activeSlot = null;
        let activeItem = null;

        // --- 優先判定主手 ---
        if (mainItem && mainItem.typeId.includes("hoe")) {
            activeSlot = mainSlot;
            activeItem = mainItem;
        }
        // --- 主手沒有，才看副手 ---
        else if (offItem && offItem.typeId.includes("hoe")) {
            activeSlot = offSlot;
            activeItem = offItem;
        }

        if (activeItem) {
            const type = block.typeId;
            const cropStates = {
                "minecraft:wheat": { maxGrowth: 7, drops: [{ id: "minecraft:wheat", count: 1 }, { id: "minecraft:wheat_seeds", count: 1 }] },
                "minecraft:carrots": { maxGrowth: 7, drops: [{ id: "minecraft:carrot", count: 2 }] },
                "minecraft:potatoes": { maxGrowth: 7, drops: [{ id: "minecraft:potato", count: 2 }] },
                "minecraft:beetroot": { maxGrowth: 7, drops: [{ id: "minecraft:beetroot", count: 1 }, { id: "minecraft:beetroot_seeds", count: 1 }] }
            };

            if (type in cropStates) {
                const cropData = cropStates[type];
                const growthState = block.permutation.getState("growth");

                if (growthState === cropData.maxGrowth) {
                    for (const drop of cropData.drops) {
                        player.dimension.spawnItem(new ItemStack(drop.id, drop.count), block.location);
                    }
                    block.setPermutation(block.permutation.withState("growth", 0));
                    player.playSound("step.grass");

                    const durability = activeItem.getComponent("durability");
                    if (durability) {
                        if (durability.damage + 1 >= durability.maxDurability) {
                            activeSlot.setItem(undefined);
                            player.playSound("random.break");
                        } else {
                            durability.damage += 1;
                            activeSlot.setItem(activeItem);
                        }
                    }
                }
            }
        }
    });
}