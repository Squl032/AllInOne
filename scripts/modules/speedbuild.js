import { world, system, EquipmentSlot, ItemStack, BlockPermutation } from "@minecraft/server";

const ITEM_TO_BLOCK = {
    "minecraft:short_grass": "minecraft:tallgrass",
    "minecraft:redstone": "minecraft:redstone_wire",
    "minecraft:string": "minecraft:tripwire",
    "minecraft:wheat_seeds": "minecraft:wheat",
    "minecraft:pumpkin_seeds": "minecraft:pumpkin_stem",
    "minecraft:melon_seeds": "minecraft:melon_stem",
    "minecraft:beetroot_seeds": "minecraft:beetroot",
    "minecraft:carrot": "minecraft:carrots",
    "minecraft:potato": "minecraft:potatoes",
    "minecraft:sugar_cane": "minecraft:reeds",
    "minecraft:sweet_berries": "minecraft:sweet_berry_bush",
    "minecraft:glow_berries": "minecraft:cave_vines",
    "minecraft:kelp": "minecraft:kelp",
    "minecraft:seagrass": "minecraft:seagrass",
    "minecraft:sea_pickle": "minecraft:sea_pickle"
};

const POT_PLANTS = new Set([
    "minecraft:dandelion", "minecraft:poppy", "minecraft:blue_orchid", "minecraft:allium",
    "minecraft:azure_bluet", "minecraft:red_tulip", "minecraft:orange_tulip", "minecraft:white_tulip",
    "minecraft:pink_tulip", "minecraft:oxeye_daisy", "minecraft:cornflower", "minecraft:lily_of_the_valley",
    "minecraft:wither_rose", "minecraft:torchflower", "minecraft:cactus", "minecraft:deadbush",
    "minecraft:bamboo", "minecraft:red_mushroom", "minecraft:brown_mushroom", "minecraft:crimson_fungus",
    "minecraft:warped_fungus", "minecraft:fern"
]);

const UNBREAKABLE_BLOCKS = new Set([
    "minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block", "minecraft:jigsaw",
    "minecraft:allow", "minecraft:deny", "minecraft:border_block", "minecraft:end_portal_frame",
    "minecraft:end_portal", "minecraft:nether_portal"
]);

function isPotPlant(typeId) {
    if (POT_PLANTS.has(typeId)) return true;
    if (typeId.includes("sapling") || typeId.includes("propagule")) return true;
    return false;
}

function isUnbreakable(typeId) {
    if (UNBREAKABLE_BLOCKS.has(typeId)) return true;
    if (typeId.includes("command_block")) return true;
    return false;
}

// 🌟 保留植物與農作物的特判，這是絕對神權的啟動條件
function isFragilePlant(id) {
    return id.includes("mushroom") || id.includes("grass") || id.includes("flower") ||
        id.includes("fern") || id.includes("bush") || id.includes("sapling") ||
        id.includes("plant") || id.includes("reeds") || id.includes("crop") ||
        id.includes("fungus") || id.includes("roots") || id.includes("vines") ||
        id.includes("wheat") || id.includes("carrots") || id.includes("potatoes") ||
        id.includes("beetroot") || id.includes("propagule");
}

export function registerSpeedBuildSystem() {

    // ==========================================
    // 1. 左鍵秒拆方塊
    // ==========================================
    world.afterEvents.entityHitBlock.subscribe((event) => {
        const player = event.damagingEntity;
        if (player.typeId !== "minecraft:player") return;

        const equippable = player.getComponent("equippable");
        if (!equippable) return;

        const headItem = equippable.getEquipmentSlot(EquipmentSlot.Head).getItem();
        if (!headItem || headItem.typeId !== "minecraft:cactus") return;

        const block = event.hitBlock;
        if (block.isAir) return;

        const blockTypeId = block.typeId;
        if (isUnbreakable(blockTypeId)) return;

        let itemToGive = undefined;
        try { itemToGive = block.getItemStack(1); } catch (e) { }

        if (itemToGive) {
            const id = itemToGive.typeId;
            if (id.includes("water") || id.includes("lava")) {
                itemToGive = undefined;
            }
        }

        let blockToClear2 = undefined;
        try {
            const states = block.permutation.getAllStates();
            if ("upper_block_bit" in states) {
                if (states["upper_block_bit"]) {
                    blockToClear2 = player.dimension.getBlock({ x: block.location.x, y: block.location.y - 1, z: block.location.z });
                } else {
                    blockToClear2 = player.dimension.getBlock({ x: block.location.x, y: block.location.y + 1, z: block.location.z });
                }
            }
        } catch (e) { }

        system.run(() => {
            const isCreative = [...world.getPlayers({ gameMode: "creative" })].some(p => p.id === player.id);

            player.dimension.runCommandAsync(`setblock ${block.location.x} ${block.location.y} ${block.location.z} air`);

            if (blockToClear2 && blockToClear2.typeId === blockTypeId) {
                player.dimension.runCommandAsync(`setblock ${blockToClear2.location.x} ${blockToClear2.location.y} ${blockToClear2.location.z} air`);
            }

            player.playSound("dig.stone", { location: block.location, pitch: 1.2, volume: 1.0 });

            if (!isCreative && itemToGive) {
                try {
                    const inventory = player.getComponent("inventory").container;
                    const mainhandSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
                    const currentItem = mainhandSlot.getItem();

                    let leftover = undefined;
                    if (currentItem && currentItem.typeId === itemToGive.typeId && currentItem.amount < currentItem.maxAmount) {
                        currentItem.amount += 1;
                        mainhandSlot.setItem(currentItem);
                    } else if (!currentItem) {
                        mainhandSlot.setItem(itemToGive);
                    } else {
                        leftover = inventory.addItem(itemToGive);
                    }

                    if (leftover) {
                        player.dimension.spawnItem(leftover, player.location);
                    }
                } catch (e) { }
            }
        });
    });

    // ==========================================
    // 2. 右鍵強制放置方塊 (全功能完美修復版)
    // ==========================================
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const player = event.player;
        const item = event.itemStack;
        if (!item) return;

        const equippable = player.getComponent("equippable");
        if (!equippable) return;

        const headItem = equippable.getEquipmentSlot(EquipmentSlot.Head).getItem();
        if (!headItem || headItem.typeId !== "minecraft:cactus") return;

        const block = event.block; // 這裡的錯字已經修好，不會再當機了
        const itemTypeId = item.typeId;

        if (block.typeId === "minecraft:flower_pot") {
            if (!player.isSneaking && isPotPlant(itemTypeId)) return;
        }

        if (itemTypeId === "minecraft:sea_pickle" && block.typeId === "minecraft:sea_pickle") {
            const currentPerm = block.permutation;
            const currentStates = currentPerm.getAllStates();
            if ("cluster_count" in currentStates) {
                const oldCount = currentStates["cluster_count"];
                if (oldCount < 3) {
                    event.cancel = true;
                    system.run(() => {
                        block.setPermutation(currentPerm.withState("cluster_count", oldCount + 1));
                        const isCreative = [...world.getPlayers({ gameMode: "creative" })].some(p => p.id === player.id);
                        if (!isCreative) {
                            const mainhandSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
                            if (item.amount > 1) {
                                item.amount -= 1; mainhandSlot.setItem(item);
                            } else { mainhandSlot.setItem(undefined); }
                        }
                        player.playSound("sea_pickle.place", { location: block.location, pitch: 1.0, volume: 1.0 });
                    });
                    return;
                }
            }
        }

        event.cancel = true;

        const face = event.blockFace.toLowerCase();
        const faceLoc = event.faceLocation;

        const offsets = {
            "up": { x: 0, y: 1, z: 0 }, "down": { x: 0, y: -1, z: 0 },
            "north": { x: 0, y: 0, z: -1 }, "south": { x: 0, y: 0, z: 1 },
            "west": { x: -1, y: 0, z: 0 }, "east": { x: 1, y: 0, z: 0 }
        };

        const offset = offsets[face];
        if (!offset) return;

        const targetLoc = {
            x: block.location.x + offset.x, y: block.location.y + offset.y, z: block.location.z + offset.z
        };

        let blockTypeId = itemTypeId;
        if (ITEM_TO_BLOCK[blockTypeId]) {
            blockTypeId = ITEM_TO_BLOCK[blockTypeId];
        }

        let isTopHalf = false;
        if (face === "down") isTopHalf = true;
        else if (face === "up") isTopHalf = false;
        else isTopHalf = faceLoc.y - block.location.y >= 0.5;

        const rotY = player.getRotation().y;
        let weirdoDir = 2; let cardinalDir = "south"; let doorDir = 1; let trapdoorDir = 0;

        if (rotY >= -45 && rotY < 45) {
            weirdoDir = 2; cardinalDir = "south"; doorDir = 1; trapdoorDir = 0;
        } else if (rotY >= 45 && rotY < 135) {
            weirdoDir = 1; cardinalDir = "west"; doorDir = 2; trapdoorDir = 1;
        } else if (rotY >= -135 && rotY < -44) {
            weirdoDir = 0; cardinalDir = "east"; doorDir = 0; trapdoorDir = 3;
        } else {
            weirdoDir = 3; cardinalDir = "north"; doorDir = 3; trapdoorDir = 2;
        }

        let pillarAxis = "y";
        if (face === "west" || face === "east") pillarAxis = "x";
        else if (face === "north" || face === "south") pillarAxis = "z";

        system.run(() => {
            const dimension = player.dimension;
            const targetBlock = dimension.getBlock(targetLoc);
            if (!targetBlock) return;

            try {
                let perm = BlockPermutation.resolve(blockTypeId);
                const states = perm.getAllStates();
                const isTwoTall = "upper_block_bit" in states;

                // 🌟 核心救贖：把 setblock replace 神權給加回來！
                // 針對草類、蘑菇等，動用絕對神權無視亮度與基岩限制
                if (isFragilePlant(blockTypeId)) {
                    if (isTwoTall) {
                        const blockAbove = dimension.getBlock({ x: targetLoc.x, y: targetLoc.y + 1, z: targetLoc.z });
                        if (!blockAbove) return;
                        dimension.runCommandAsync(`setblock ${targetLoc.x} ${targetLoc.y} ${targetLoc.z} ${blockTypeId} ["upper_block_bit":false] replace`);
                        dimension.runCommandAsync(`setblock ${targetLoc.x} ${targetLoc.y + 1} ${targetLoc.z} ${blockTypeId} ["upper_block_bit":true] replace`);
                    } else {
                        if (blockTypeId === "minecraft:sea_pickle") {
                            dimension.runCommandAsync(`setblock ${targetLoc.x} ${targetLoc.y} ${targetLoc.z} ${blockTypeId} ["waterlogged":false] replace`);
                        } else {
                            dimension.runCommandAsync(`setblock ${targetLoc.x} ${targetLoc.y} ${targetLoc.z} ${blockTypeId} replace`);
                        }
                    }

                    const isCreative = [...world.getPlayers({ gameMode: "creative" })].some(p => p.id === player.id);
                    if (!isCreative) {
                        const mainhandSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
                        if (item.amount > 1) {
                            item.amount -= 1; mainhandSlot.setItem(item);
                        } else { mainhandSlot.setItem(undefined); }
                    }
                    if (blockTypeId === "minecraft:sea_pickle") {
                        player.playSound("sea_pickle.place", { location: targetLoc, pitch: 1.0, volume: 1.0 });
                    } else {
                        player.playSound("use.grass", { location: targetLoc, pitch: 1.0, volume: 1.0 });
                    }
                    return; // 執行完神權指令，直接結束這次放置
                }

                // --- 針對活板門、柵欄門、半磚、一般門，維持完美的 BlockPermutation ---
                let finalDirection = doorDir;
                if (blockTypeId.includes("trapdoor") || blockTypeId.includes("fence_gate")) {
                    finalDirection = trapdoorDir;
                }

                if ("minecraft:vertical_half" in states) perm = perm.withState("minecraft:vertical_half", isTopHalf ? "top" : "bottom");
                if ("upside_down_bit" in states) perm = perm.withState("upside_down_bit", isTopHalf);
                if ("weirdo_direction" in states) perm = perm.withState("weirdo_direction", weirdoDir);
                if ("minecraft:cardinal_direction" in states) perm = perm.withState("minecraft:cardinal_direction", cardinalDir);
                if ("pillar_axis" in states) perm = perm.withState("pillar_axis", pillarAxis);
                if ("direction" in states) perm = perm.withState("direction", finalDirection);

                // 強制關好門
                if ("open_bit" in states) perm = perm.withState("open_bit", false);

                if ("hanging" in states) { const isHanging = (face !== "up"); perm = perm.withState("hanging", isHanging); }
                if ("dripstone_thickness" in states) perm = perm.withState("dripstone_thickness", "tip");

                if (isTwoTall) {
                    const blockAbove = dimension.getBlock({ x: targetLoc.x, y: targetLoc.y + 1, z: targetLoc.z });
                    if (!blockAbove) return;
                    targetBlock.setPermutation(perm.withState("upper_block_bit", false));
                    blockAbove.setPermutation(perm.withState("upper_block_bit", true));
                } else {
                    targetBlock.setPermutation(perm);
                }

                const isCreative = [...world.getPlayers({ gameMode: "creative" })].some(p => p.id === player.id);
                if (!isCreative) {
                    const mainhandSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
                    if (item.amount > 1) {
                        item.amount -= 1; mainhandSlot.setItem(item);
                    } else { mainhandSlot.setItem(undefined); }
                }

                if (blockTypeId.includes("dripstone") || blockTypeId.includes("coral")) {
                    player.playSound("stone.stone_brick.place", { location: targetLoc, pitch: 1.0, volume: 1.0 });
                } else if (blockTypeId.includes("door") || blockTypeId.includes("trapdoor") || blockTypeId.includes("fence")) {
                    player.playSound("use.wood", { location: targetLoc, pitch: 1.0, volume: 1.0 });
                } else {
                    player.playSound("use.stone", { location: targetLoc, pitch: 1.0, volume: 1.0 });
                }

            } catch (e) { }
        });
    });
}