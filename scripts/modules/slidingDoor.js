import { world, system, EquipmentSlot } from "@minecraft/server";

let slidingCache = [];
let isSlidingLoaded = false;
const interactCooldown = new Map();

function saveSlidingDoors() {
    world.setDynamicProperty("custom_sliding_doors", JSON.stringify(slidingCache));
}

function loadSlidingDoors() {
    if (isSlidingLoaded) return;
    try { slidingCache = JSON.parse(world.getDynamicProperty("custom_sliding_doors") || "[]"); }
    catch (e) { slidingCache = []; }
    isSlidingLoaded = true;
}

// 根據玩家視角計算「左側」與「右側」的座標偏移量
function getSideOffsets(rotY) {
    if (rotY >= -45 && rotY < 45) return [{ x: 1, z: 0 }, { x: -1, z: 0 }];
    if (rotY >= 45 && rotY < 135) return [{ x: 0, z: 1 }, { x: 0, z: -1 }];
    if (rotY >= -135 && rotY < -45) return [{ x: 0, z: -1 }, { x: 0, z: 1 }];
    return [{ x: -1, z: 0 }, { x: 1, z: 0 }];
}

export function registerSlidingDoorSystem() {
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const player = event.player;
        if (!player || !player.isValid) return;

        const block = event.block;
        if (!block) return;

        // 避免跟雙開門系統衝突
        if (block.typeId.includes("door") && !block.typeId.includes("trapdoor")) return;

        const now = Date.now();
        const lastTime = interactCooldown.get(player.id) || 0;

        const equippable = player.getComponent("equippable");
        if (!equippable) return;
        const item = equippable.getEquipmentSlot(EquipmentSlot.Mainhand).getItem();

        loadSlidingDoors();

        const ox = block.location.x;
        const oy = block.location.y;
        const oz = block.location.z;
        const dimId = player.dimension.id;

        // 檢查點擊的方塊是否隸屬於任何一個已註冊的拉門 (包含原位與平移位)
        const existingIndex = slidingCache.findIndex(d =>
            d.dim === dimId && (
                (d.ox === ox && d.oy === oy && d.oz === oz) ||
                (d.ox === ox && d.oy + 1 === oy && d.oz === oz) ||
                (d.tx === ox && d.ty === oy && d.tz === oz) ||
                (d.tx === ox && d.ty + 1 === oy && d.tz === oz)
            )
        );

        if (player.isSneaking && item && item.typeId === "minecraft:blaze_rod") {
            event.cancel = true;
            if (now - lastTime < 500) return;
            interactCooldown.set(player.id, now);

            system.run(() => {
                if (existingIndex > -1) {
                    slidingCache.splice(existingIndex, 1);
                    saveSlidingDoors();
                    player.sendMessage("§c[Carpenter] Removed sliding door mechanism.§r");
                    player.onScreenDisplay.setActionBar("§c🚪 Sliding Door: REMOVED");
                    player.playSound("random.break");
                } else {
                    const dim = player.dimension;
                    const offsets = getSideOffsets(player.getRotation().y);
                    let targetLoc = null;

                    // 尋找左右兩側是否有 1x2 的純淨空氣空間供門滑動
                    for (const off of offsets) {
                        const b1 = dim.getBlock({ x: ox + off.x, y: oy, z: oz + off.z });
                        const b2 = dim.getBlock({ x: ox + off.x, y: oy + 1, z: oz + off.z });
                        if (b1 && b1.isAir && b2 && b2.isAir) {
                            targetLoc = { x: ox + off.x, y: oy, z: oz + off.z };
                            break;
                        }
                    }

                    if (!targetLoc) {
                        player.sendMessage("§c[Carpenter] Failed! Need 1x2 empty space to the left or right to slide.§r");
                        player.playSound("note.bass");
                        return;
                    }

                    slidingCache.push({
                        ox: ox, oy: oy, oz: oz,
                        tx: targetLoc.x, ty: targetLoc.y, tz: targetLoc.z,
                        dim: dimId,
                        isOpen: false
                    });
                    saveSlidingDoors();
                    player.sendMessage("§a[Carpenter] Sliding Door created! Right-click to slide.§r");
                    player.onScreenDisplay.setActionBar("§a🚪 Sliding Door: OK");
                    player.playSound("random.levelup");
                }
            });
            return;
        }

        // ==========================================
        // 🚪 使用模式：點擊拉門
        // ==========================================
        if (existingIndex > -1 && !player.isSneaking) {
            event.cancel = true; // 攔截原有方塊(如活板門)的互動

            if (now - lastTime < 300) return;
            interactCooldown.set(player.id, now);

            system.run(() => {
                const door = slidingCache[existingIndex];
                const dim = world.getDimension(door.dim);

                try {
                    const bCheck = dim.getBlock({ x: door.ox, y: door.oy, z: door.oz });
                    const tCheck = dim.getBlock({ x: door.tx, y: door.ty, z: door.tz });

                    // 防呆機制：如果拉門方塊已經被玩家挖掉消失了，自動註銷
                    if ((!door.isOpen && (!bCheck || bCheck.isAir)) || (door.isOpen && (!tCheck || tCheck.isAir))) {
                        slidingCache.splice(existingIndex, 1);
                        saveSlidingDoors();
                        return;
                    }

                    // 執行物理平移
                    if (!door.isOpen) {
                        // 拉開
                        const bBottom = dim.getBlock({ x: door.ox, y: door.oy, z: door.oz });
                        const bTop = dim.getBlock({ x: door.ox, y: door.oy + 1, z: door.oz });

                        const pBottom = bBottom?.permutation;
                        const pTop = bTop?.permutation;

                        if (pBottom) dim.getBlock({ x: door.tx, y: door.ty, z: door.tz }).setPermutation(pBottom);
                        if (pTop) dim.getBlock({ x: door.tx, y: door.ty + 1, z: door.tz }).setPermutation(pTop);

                        if (bBottom) bBottom.setType("minecraft:air");
                        if (bTop) bTop.setType("minecraft:air");

                        door.isOpen = true;
                        dim.playSound("block.barrel.open", { x: door.ox, y: door.oy, z: door.oz }, { pitch: 0.8 });
                    } else {
                        // 關上
                        const bBottom = dim.getBlock({ x: door.tx, y: door.ty, z: door.tz });
                        const bTop = dim.getBlock({ x: door.tx, y: door.ty + 1, z: door.tz });

                        const pBottom = bBottom?.permutation;
                        const pTop = bTop?.permutation;

                        if (pBottom) dim.getBlock({ x: door.ox, y: door.oy, z: door.oz }).setPermutation(pBottom);
                        if (pTop) dim.getBlock({ x: door.ox, y: door.oy + 1, z: door.oz }).setPermutation(pTop);

                        if (bBottom) bBottom.setType("minecraft:air");
                        if (bTop) bTop.setType("minecraft:air");

                        door.isOpen = false;
                        dim.playSound("block.barrel.close", { x: door.ox, y: door.oy, z: door.oz }, { pitch: 0.8 });
                    }
                    saveSlidingDoors();
                } catch (e) { }
            });
        }
    });
}