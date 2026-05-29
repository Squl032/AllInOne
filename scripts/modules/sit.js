import { world, system, EquipmentSlot } from "@minecraft/server";

const activeChairs = new Map();

export function registerSitSystem() {

    // ==========================================
    // 🌟 自動大掃除：每次重啟/Reload時，自動清除所有殘留的幽靈座椅！
    // ==========================================
    system.run(() => {
        for (const dimName of ["overworld", "nether", "the_end"]) {
            try {
                const dim = world.getDimension(dimName);
                // 抓出所有帶有自訂椅子標籤的實體
                const orphanedChairs = dim.getEntities({ tags: ["custom_chair"] });
                for (const chair of orphanedChairs) {
                    chair.remove(); // 直接抹除，不掉落豬肉跟鞍！
                }
            } catch (e) { }
        }
    });

    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const player = event.player;
        const block = event.block;

        if (player.isSneaking) return;

        // 防誤觸機制：戴著仙人掌絕對不坐下
        const equippable = player.getComponent("equippable");
        if (equippable) {
            const headItem = equippable.getEquipmentSlot(EquipmentSlot.Head).getItem();
            if (headItem && headItem.typeId === "minecraft:cactus") {
                return;
            }
        }

        const typeId = block.typeId;
        const isStair = typeId.includes("stairs");
        const isSlab = typeId.includes("slab");

        if (!isStair && !isSlab) return;

        // 判斷是否為「全磚」或「上半身」
        let sitsOnTop = false;

        if (isSlab && typeId.includes("double")) {
            sitsOnTop = true;
        }

        try {
            const states = block.permutation.getAllStates();
            if (isStair && states["upside_down_bit"] === true) sitsOnTop = true;
            if (isSlab && !sitsOnTop) {
                if (states["minecraft:vertical_half"] === "top") sitsOnTop = true;
                if (states["minecraft:full_block_bit"] === true) sitsOnTop = true;
            }
        } catch (e) { }

        // 防窒息空間精準審查
        const dim = player.dimension;
        const { x, y, z } = block.location;
        const blockAbove1 = dim.getBlock({ x, y: y + 1, z });
        const blockAbove2 = dim.getBlock({ x, y: y + 2, z });

        if (sitsOnTop) {
            if (blockAbove1 && !blockAbove1.isAir) return;
            if (blockAbove2 && !blockAbove2.isAir) return;
        } else {
            if (blockAbove1 && !blockAbove1.isAir) return;
        }

        event.cancel = true;

        system.run(() => {
            // 🌟 雙重保險：除了清空記憶體，也強制去世界裡抓取專屬於這個玩家的舊椅子並刪除
            try {
                const oldChairs = dim.getEntities({ tags: [`chair_${player.id}`] });
                for (const oldChair of oldChairs) {
                    oldChair.remove();
                }
            } catch (e) { }
            activeChairs.delete(player.id);

            // 動態調整坐下高度
            const spawnLoc = {
                x: x + 0.5,
                y: sitsOnTop ? y + 0.3 : y - 0.2,
                z: z + 0.5
            };

            const chair = dim.spawnEntity("minecraft:pig", spawnLoc);
            chair.addTag(`chair_${player.id}`);
            chair.addTag("custom_chair"); // 🌟 加入通用標籤，為了讓重啟大掃除能抓到牠

            chair.runCommandAsync("event entity @s minecraft:on_saddled").catch(() => { });

            chair.addEffect("invisibility", 999999, { amplifier: 255, showParticles: false });
            chair.addEffect("slowness", 999999, { amplifier: 255, showParticles: false });
            chair.addEffect("resistance", 999999, { amplifier: 255, showParticles: false });

            activeChairs.set(player.id, { entity: chair, time: Date.now(), loc: spawnLoc });

            system.runTimeout(() => {
                const rideCommand = `ride @a[name="${player.name}"] start_riding @e[tag=chair_${player.id},c=1]`;

                player.dimension.runCommandAsync(rideCommand).catch((e) => {
                    try { chair.remove(); } catch (err) { }
                    activeChairs.delete(player.id);
                });
            }, 4);
        });
    });

    system.runInterval(() => {
        if (activeChairs.size === 0) return;

        const now = Date.now();
        const allPlayers = world.getAllPlayers();

        for (const [playerId, chairData] of activeChairs.entries()) {
            const chairEntity = chairData.entity;
            const spawnTime = chairData.time;

            try {
                if (chairEntity.isValid()) {
                    chairEntity.teleport(chairData.loc);
                }
            } catch (e) { }

            if (now - spawnTime < 1000) continue;

            const player = allPlayers.find(p => p.id === playerId);
            let shouldRemove = false;

            if (!player) {
                shouldRemove = true; // 玩家離線，標記刪除
            } else {
                try {
                    const dx = player.location.x - chairEntity.location.x;
                    const dy = player.location.y - chairEntity.location.y;
                    const dz = player.location.z - chairEntity.location.z;
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    if (distance > 1.5 || player.isSneaking) {
                        shouldRemove = true;
                    }
                } catch (e) {
                    shouldRemove = true;
                }
            }

            if (shouldRemove) {
                try { chairEntity.remove(); } catch (e) { }
                activeChairs.delete(playerId);
            }
        }
    }, 1);
}