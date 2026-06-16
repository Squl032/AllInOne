import { world, system, EquipmentSlot, ItemStack, BlockPermutation, GameMode } from "@minecraft/server";

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

function isFragilePlant(id) {
    return id.includes("mushroom") || id.includes("grass") || id.includes("flower") ||
        id.includes("fern") || id.includes("bush") || id.includes("sapling") ||
        id.includes("plant") || id.includes("reeds") || id.includes("crop") ||
        id.includes("fungus") || id.includes("roots") || id.includes("vines") ||
        id.includes("wheat") || id.includes("carrots") || id.includes("potatoes") ||
        id.includes("beetroot") || id.includes("propagule");
}

// 🌟 全新獨立函數：安全扣除手上物品 (完美解決預測回彈 BUG)
function consumeHandItem(player, targetTypeId) {
    // 延遲 1 Tick：等客戶端的「取消事件預測退還」結束後，強制伺服器覆蓋扣除數量！
    system.runTimeout(() => {
        if (!player || !player.isValid) return;

        const equippable = player.getComponent("equippable");
        if (!equippable) return;

        const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
        const offSlot = equippable.getEquipmentSlot(EquipmentSlot.Offhand);

        let slotToUse = null;
        let currentItem = mainSlot.getItem();

        if (currentItem && currentItem.typeId === targetTypeId) {
            slotToUse = mainSlot;
        } else {
            currentItem = offSlot.getItem();
            if (currentItem && currentItem.typeId === targetTypeId) {
                slotToUse = offSlot;
            }
        }

        if (slotToUse && currentItem) {
            if (currentItem.amount > 1) {
                // 必須使用 clone()，否則系統會以為是同一個物品拒絕更新畫面
                const clonedItem = currentItem.clone();
                clonedItem.amount -= 1;
                slotToUse.setItem(clonedItem);
            } else {
                slotToUse.setItem(undefined);
            }
        }
    }, 1);
}

export function registerSpeedBuildSystem() {

    // ==========================================
    // 1. 左鍵秒拆方塊
    // ==========================================
    world.afterEvents.entityHitBlock.subscribe((event) => {
        const player = event.damagingEntity;
        if (!player || player.typeId !== "minecraft:player" || !player.isValid) return;

        const equippable = player.getComponent("equippable");
        if (!equippable) return;

        const headItem = equippable.getEquipmentSlot(EquipmentSlot.Head).getItem();
        if (!headItem || headItem.typeId !== "minecraft:cactus") return;

        const block = event.hitBlock;
        if (!block || block.isAir) return;

        const blockTypeId = block.typeId;
        if (isUnbreakable(blockTypeId)) return;

        const blockLoc = { x: block.location.x, y: block.location.y, z: block.location.z };

        // 🌟 強化獲取掉落物邏輯：在方塊被刪除前，創造一個絕對安全的複製品！
        let itemToGive = undefined;
        try {
            const rawItem = block.getItemStack(1);
            if (rawItem) itemToGive = rawItem.clone();
        } catch (e) { }

        // 雙重保險：如果原生獲取失敗，我們手動創造一個這個方塊的 ItemStack
        if (!itemToGive && !blockTypeId.includes("water") && !blockTypeId.includes("lava")) {
            try { itemToGive = new ItemStack(blockTypeId, 1); } catch (e) { }
        }

        let blockToClear2Loc = undefined;
        try {
            const states = block.permutation.getAllStates();
            if ("upper_block_bit" in states) {
                if (states["upper_block_bit"]) {
                    blockToClear2Loc = { x: blockLoc.x, y: blockLoc.y - 1, z: blockLoc.z };
                } else {
                    blockToClear2Loc = { x: blockLoc.x, y: blockLoc.y + 1, z: blockLoc.z };
                }
            }
        } catch (e) { }

        system.run(() => {
            if (!player || !player.isValid) return;

            const isCreative = [...world.getPlayers({ gameMode: GameMode.creative })].some(p => p.id === player.id);

            try { player.dimension.runCommand(`setblock ${blockLoc.x} ${blockLoc.y} ${blockLoc.z} air`); } catch (e) { }

            if (blockToClear2Loc) {
                try {
                    const b2 = player.dimension.getBlock(blockToClear2Loc);
                    if (b2 && b2.typeId === blockTypeId) {
                        player.dimension.runCommand(`setblock ${blockToClear2Loc.x} ${blockToClear2Loc.y} ${blockToClear2Loc.z} air`);
                    }
                } catch (e) { }
            }

            player.playSound("dig.stone", { location: blockLoc, pitch: 1.2, volume: 1.0 });

            // 🌟 將挖掘到的方塊放入背包
            if (!isCreative && itemToGive) {
                try {
                    const inventory = player.getComponent("inventory").container;
                    // 使用 addItem，自動找空位或疊加，絕對不會卡住
                    const leftover = inventory.addItem(itemToGive);
                    if (leftover) {
                        player.dimension.spawnItem(leftover, player.location);
                    }
                } catch (e) { }
            }
        });
    });

    // ==========================================
    // 2. 右鍵強制放置方塊
    // ==========================================
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const player = event.player;
        const item = event.itemStack;
        if (!item) return;

        const equippable = player.getComponent("equippable");
        if (!equippable) return;

        const headItem = equippable.getEquipmentSlot(EquipmentSlot.Head).getItem();
        if (!headItem || headItem.typeId !== "minecraft:cactus") return;

        const block = event.block;
        if (!block) return;
        const blockLoc = block.location;
        const itemTypeId = item.typeId;

        if (block.typeId === "minecraft:flower_pot") {
            if (!player.isSneaking && isPotPlant(itemTypeId)) return;
        }

        // --- 海泡菜特判 ---
        if (itemTypeId === "minecraft:sea_pickle" && block.typeId === "minecraft:sea_pickle") {
            const currentPerm = block.permutation;
            const currentStates = currentPerm.getAllStates();
            if ("cluster_count" in currentStates) {
                const oldCount = currentStates["cluster_count"];
                if (oldCount < 3) {
                    event.cancel = true;
                    system.run(() => {
                        if (!player || !player.isValid) return;

                        const currentBlock = player.dimension.getBlock(blockLoc);
                        if (currentBlock && currentBlock.typeId === "minecraft:sea_pickle") {
                            currentBlock.setPermutation(currentPerm.withState("cluster_count", oldCount + 1));
                        }

                        const isCreative = [...world.getPlayers({ gameMode: GameMode.creative })].some(p => p.id === player.id);
                        if (!isCreative) {
                            // 呼叫安全扣除函數
                            consumeHandItem(player, itemTypeId);
                        }
                        player.playSound("sea_pickle.place", { location: blockLoc, pitch: 1.0, volume: 1.0 });
                    });
                    return;
                }
            }
        }

        event.cancel = true;

        const face = event.blockFace.toLowerCase();
        const faceLoc = { x: event.faceLocation.x, y: event.faceLocation.y, z: event.faceLocation.z };

        const offsets = {
            "up": { x: 0, y: 1, z: 0 }, "down": { x: 0, y: -1, z: 0 },
            "north": { x: 0, y: 0, z: -1 }, "south": { x: 0, y: 0, z: 1 },
            "west": { x: -1, y: 0, z: 0 }, "east": { x: 1, y: 0, z: 0 }
        };

        const offset = offsets[face];
        if (!offset) return;

        const targetLoc = {
            x: blockLoc.x + offset.x, y: blockLoc.y + offset.y, z: blockLoc.z + offset.z
        };

        let blockTypeId = itemTypeId;
        if (ITEM_TO_BLOCK[blockTypeId]) {
            blockTypeId = ITEM_TO_BLOCK[blockTypeId];
        }

        let isTopHalf = false;
        if (face === "down") isTopHalf = true;
        else if (face === "up") isTopHalf = false;
        else isTopHalf = faceLoc.y - blockLoc.y >= 0.5;

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
            if (!player || !player.isValid) return;

            const dimension = player.dimension;
            const targetBlock = dimension.getBlock(targetLoc);
            if (!targetBlock) return;

            try {
                let perm = BlockPermutation.resolve(blockTypeId);
                const states = perm.getAllStates();
                const isTwoTall = "upper_block_bit" in states;

                if (isFragilePlant(blockTypeId)) {
                    if (isTwoTall) {
                        const blockAbove = dimension.getBlock({ x: targetLoc.x, y: targetLoc.y + 1, z: targetLoc.z });
                        if (!blockAbove) return;
                        try { dimension.runCommand(`setblock ${targetLoc.x} ${targetLoc.y} ${targetLoc.z} ${blockTypeId} ["upper_block_bit":false] replace`); } catch (e) { }
                        try { dimension.runCommand(`setblock ${targetLoc.x} ${targetLoc.y + 1} ${targetLoc.z} ${blockTypeId} ["upper_block_bit":true] replace`); } catch (e) { }
                    } else {
                        if (blockTypeId === "minecraft:sea_pickle") {
                            try { dimension.runCommand(`setblock ${targetLoc.x} ${targetLoc.y} ${targetLoc.z} ${blockTypeId} ["waterlogged":false] replace`); } catch (e) { }
                        } else {
                            try { dimension.runCommand(`setblock ${targetLoc.x} ${targetLoc.y} ${targetLoc.z} ${blockTypeId} replace`); } catch (e) { }
                        }
                    }

                    const isCreative = [...world.getPlayers({ gameMode: GameMode.creative })].some(p => p.id === player.id);
                    if (!isCreative) {
                        // 呼叫安全扣除函數
                        consumeHandItem(player, itemTypeId);
                    }
                    if (blockTypeId === "minecraft:sea_pickle") {
                        player.playSound("sea_pickle.place", { location: targetLoc, pitch: 1.0, volume: 1.0 });
                    } else {
                        player.playSound("use.grass", { location: targetLoc, pitch: 1.0, volume: 1.0 });
                    }
                    return;
                }

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

                const isCreative = [...world.getPlayers({ gameMode: GameMode.creative })].some(p => p.id === player.id);
                if (!isCreative) {
                    // 呼叫安全扣除函數
                    consumeHandItem(player, itemTypeId);
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