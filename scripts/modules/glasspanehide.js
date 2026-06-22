import { world, system, EquipmentSlot, BlockPermutation } from "@minecraft/server";

const REGISTER_ITEM_ID = "minecraft:end_rod";

let hiddenGlassCache = [];
let isHiddenGlassLoaded = false;
const interactCooldown = new Map();

function saveHiddenGlassDoors() {
    world.setDynamicProperty("custom_hidden_glass", JSON.stringify(hiddenGlassCache));
}

function loadHiddenGlassDoors() {
    if (isHiddenGlassLoaded) return;
    try {
        hiddenGlassCache = JSON.parse(world.getDynamicProperty("custom_hidden_glass") || "[]");
    } catch (e) {
        hiddenGlassCache = [];
    }
    isHiddenGlassLoaded = true;
}

export function registerHiddenGlassPaneSystem() {
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const player = event.player;
        if (!player || !player.isValid) return;

        const block = event.block;
        if (!block) return;

        const now = Date.now();
        const lastTime = interactCooldown.get(player.id) || 0;

        const equippable = player.getComponent("equippable");
        if (!equippable) return;
        const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
        const item = mainSlot.getItem();

        loadHiddenGlassDoors();

        const cl = block.location;
        const dimId = player.dimension.id;

        // 計算玩家「穿透點擊」的相鄰空格座標
        const face = event.blockFace.toLowerCase();
        const offsets = {
            "up": { x: 0, y: 1, z: 0 }, "down": { x: 0, y: -1, z: 0 },
            "north": { x: 0, y: 0, z: -1 }, "south": { x: 0, y: 0, z: 1 },
            "west": { x: -1, y: 0, z: 0 }, "east": { x: 1, y: 0, z: 0 }
        };
        const off = offsets[face];
        // 這是玩家實際想點的「那個空氣格」
        const al = { x: cl.x + off.x, y: cl.y + off.y, z: cl.z + off.z };

        // 尋找是否點擊到了玻璃，或是「穿透點到了隱藏中的玻璃位置」
        const existingIndex = hiddenGlassCache.findIndex(d =>
            d.dim === dimId && (
                // 實體點擊 (玻璃顯示中)
                (cl.x === d.x && cl.y === d.y && cl.z === d.z) ||
                (cl.x === d.x && cl.y === d.y + 1 && cl.z === d.z) ||
                // 穿透點擊 (玻璃隱藏中)
                (d.isHidden && al.x === d.x && al.y === d.y && al.z === d.z) ||
                (d.isHidden && al.x === d.x && al.y === d.y + 1 && al.z === d.z)
            )
        );

        // ==========================================
        // 🛠️ 施工模式：玩家蹲下 + 手持 End Rod
        // ==========================================
        if (player.isSneaking && item && item.typeId === REGISTER_ITEM_ID) {
            // 只有點擊實體玻璃片才能進行註冊/拆除
            if (!block.typeId.includes("glass_pane")) return;

            event.cancel = true;

            if (now - lastTime < 500) return;
            interactCooldown.set(player.id, now);

            system.run(() => {
                if (existingIndex > -1) {
                    const door = hiddenGlassCache[existingIndex];
                    // 如果拆除時門是隱藏的，強制把它變回來
                    if (door.isHidden) {
                        try {
                            const dim = player.dimension;
                            const pBottom = BlockPermutation.resolve(door.bType, door.bStates);
                            const pTop = BlockPermutation.resolve(door.tType, door.tStates);
                            dim.getBlock({ x: door.x, y: door.y, z: door.z }).setPermutation(pBottom);
                            dim.getBlock({ x: door.x, y: door.y + 1, z: door.z }).setPermutation(pTop);
                        } catch (e) { }
                    }
                    hiddenGlassCache.splice(existingIndex, 1);
                    saveHiddenGlassDoors();
                    player.sendMessage("§c[Carpenter] Removed glass partition mechanism.§r");
                    player.onScreenDisplay.setActionBar("§c❌ Glass Partition: REMOVED");
                    player.playSound("random.break");
                } else {
                    const dim = player.dimension;
                    const bAbove = dim.getBlock({ x: cl.x, y: cl.y + 1, z: cl.z });

                    if (!bAbove || !bAbove.typeId.includes("glass_pane")) {
                        player.sendMessage("§c[Carpenter] Failed! Need a glass pane above for a 1x2 structure.§r");
                        player.playSound("note.bass");
                        return;
                    }

                    // 🌟 核心記憶：把玻璃片的所有狀態 (方向、含水、顏色) 死死記住！
                    hiddenGlassCache.push({
                        x: cl.x, y: cl.y, z: cl.z,
                        dim: dimId,
                        isHidden: false,
                        bType: block.typeId,
                        bStates: block.permutation.getAllStates(),
                        tType: bAbove.typeId,
                        tStates: bAbove.permutation.getAllStates()
                    });

                    saveHiddenGlassDoors();
                    player.sendMessage("§b[Carpenter] Glass partition connected! Right-click to hide.§r");
                    player.onScreenDisplay.setActionBar("§b🔧 Glass Partition: OK");
                    player.playSound("random.levelup");
                }
            });
            return;
        }

        // ==========================================
        // 🚿 使用模式：玩家開關玻璃門
        // ==========================================
        if (existingIndex > -1 && !player.isSneaking) {
            // 如果點擊的是實體玻璃片，攔截原本動作
            if (block.typeId.includes("glass_pane")) {
                event.cancel = true;
            }
            // 如果是穿透點擊 (點到牆壁或地板)，我們也要攔截，防止他真的把手上的方塊放下去
            else if (hiddenGlassCache[existingIndex].isHidden) {
                event.cancel = true;
            }

            if (now - lastTime < 300) return;
            interactCooldown.set(player.id, now);

            system.run(() => {
                const door = hiddenGlassCache[existingIndex];
                const dim = world.getDimension(door.dim);

                try {
                    if (!door.isHidden) {
                        // 隱藏玻璃 (設為空氣)
                        const bBottom = dim.getBlock({ x: door.x, y: door.y, z: door.z });
                        const bTop = dim.getBlock({ x: door.x, y: door.y + 1, z: door.z });

                        if (bBottom) bBottom.setType("minecraft:air");
                        if (bTop) bTop.setType("minecraft:air");

                        door.isHidden = true;
                        dim.playSound("random.glass", { location: { x: door.x, y: door.y, z: door.z }, pitch: 0.8, volume: 1.0 });
                    } else {
                        // 🌟 恢復玻璃 (讀取記憶體中的完美狀態)
                        const pBottom = BlockPermutation.resolve(door.bType, door.bStates);
                        const pTop = BlockPermutation.resolve(door.tType, door.tStates);

                        dim.getBlock({ x: door.x, y: door.y, z: door.z }).setPermutation(pBottom);
                        dim.getBlock({ x: door.x, y: door.y + 1, z: door.z }).setPermutation(pTop);

                        door.isHidden = false;
                        dim.playSound("random.glass", { location: { x: door.x, y: door.y, z: door.z }, pitch: 1.2, volume: 1.0 });
                    }
                    saveHiddenGlassDoors();
                } catch (e) { }
            });
        }
    });
}