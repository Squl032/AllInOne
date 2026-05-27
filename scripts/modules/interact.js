import { world, EquipmentSlot, ItemStack } from "@minecraft/server";

export function registerInteractSystem() {
    world.afterEvents.playerInteractWithEntity.subscribe((event) => {
        const player = event.player;
        const target = event.target;

        if (target.typeId === "minecraft:player") {
            const equippable = player.getComponent("equippable");
            const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
            const offSlot = equippable.getEquipmentSlot(EquipmentSlot.Offhand);

            const mainItem = mainSlot.getItem();
            const offItem = offSlot.getItem();

            let activeSlot = null;
            let activeItem = null;

            // --- 優先判定主手 ---
            if (mainItem && (mainItem.typeId === "minecraft:bucket" || mainItem.typeId === "minecraft:bowl")) {
                activeSlot = mainSlot;
                activeItem = mainItem;
            }
            // --- 主手沒有，才看副手 ---
            else if (offItem && (offItem.typeId === "minecraft:bucket" || offItem.typeId === "minecraft:bowl")) {
                activeSlot = offSlot;
                activeItem = offItem;
            }

            let isMilking = false;

            if (activeItem) {
                if (activeItem.typeId === "minecraft:bucket") {
                    target.dimension.playSound("mob.cow.milk", target.location, { pitch: 1.0, volume: 1.0 });
                    player.runCommandAsync("playanimation @s animation.player.attack.rotations a 0.5");
                    handleItemExchange(player, activeSlot, activeItem, "minecraft:milk_bucket");
                    isMilking = true;
                } else if (activeItem.typeId === "minecraft:bowl") {
                    target.dimension.playSound("mob.cow.milk", target.location, { pitch: 1.0, volume: 1.0 });
                    player.runCommandAsync("playanimation @s animation.player.attack.rotations a 0.5");
                    handleItemExchange(player, activeSlot, activeItem, "minecraft:mushroom_stew");
                    isMilking = true;
                }
            }

            if (!isMilking) {
                const yDifference = event.interactLocation.y - target.location.y;
                if (yDifference > 1.4) {
                    target.dimension.spawnParticle("minecraft:villager_happy", {
                        x: target.location.x, y: target.location.y + 2.1, z: target.location.z
                    });
                    target.dimension.playSound("step.cloth", target.location, { pitch: 1.2, volume: 1.0 });
                    player.runCommandAsync("playanimation @s animation.player.attack.rotations a 0.5");
                }
            }
        }
    });
}

function handleItemExchange(player, activeSlot, item, newItemTypeId) {
    if (item.amount > 1) {
        item.amount -= 1;
        activeSlot.setItem(item);
        const inventory = player.getComponent("inventory").container;
        const newItem = new ItemStack(newItemTypeId, 1);
        const leftover = inventory.addItem(newItem);
        if (leftover) player.dimension.spawnItem(leftover, player.location);
    } else {
        activeSlot.setItem(new ItemStack(newItemTypeId, 1));
    }
}