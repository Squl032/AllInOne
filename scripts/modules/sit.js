import { world, system, ItemStack } from "@minecraft/server";

const activeChairs = new Map();

export function registerSitSystem() {

    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const player = event.player;
        const block = event.block;

        if (player.isSneaking) return;

        const typeId = block.typeId;
        const isStairOrSlab = typeId.includes("stairs") || typeId.includes("slab");

        if (isStairOrSlab) {
            // 攔截右鍵，避免放方塊
            event.cancel = true;

            system.run(() => {
                // 清掉同玩家的舊椅子
                if (activeChairs.has(player.id)) {
                    const oldData = activeChairs.get(player.id);
                    try { oldData.entity.remove(); } catch (e) { }
                    activeChairs.delete(player.id);
                }

                // 📌 修改 1：將 Y 軸從 +0.4 下調為 -0.2，達到完美的沉浸高度
                const spawnLoc = {
                    x: block.location.x + 0.5,
                    y: block.location.y - 0.2, 
                    z: block.location.z + 0.5
                };

                const chair = player.dimension.spawnEntity("minecraft:pig", spawnLoc);
                chair.addTag(`chair_${player.id}`);

                chair.runCommandAsync("event entity @s minecraft:on_saddled").catch(() => { });
                // chair.runCommandAsync("tp @s ~ ~-1 ~").catch(() => { });
                // player.dimension.runCommandAsync(`event entity @e[tag=chair_${player.id},c=1] minecraft:on_saddled`).catch(() => { });

                chair.addEffect("invisibility", 999999, { amplifier: 255, showParticles: false });
                chair.addEffect("slowness", 999999, { amplifier: 255, showParticles: false });
                chair.addEffect("resistance", 999999, { amplifier: 255, showParticles: false });

                // 📌 修改 2：把設定好的 spawnLoc 一起存進去，方便輪詢時讀取
                activeChairs.set(player.id, { entity: chair, time: Date.now(), loc: spawnLoc });

                // 延遲幾 ticks 確保標籤註冊完成再執行 ride
                system.runTimeout(() => {
                    const rideCommand = `ride @a[name="${player.name}"] start_riding @e[tag=chair_${player.id},c=1]`;

                    player.dimension.runCommandAsync(rideCommand).catch((e) => {
                        player.onScreenDisplay.setActionBar(`§cRide Failed: ${e.message}§r`);
                        try { chair.remove(); } catch (err) { }
                        activeChairs.delete(player.id);
                    });
                }, 4);
            });
        }
    });

    // 📌 修改 3：輪詢從 4 tick 改為 1 tick，確保每幀都鎖定座標，畫面才不會抖動
    system.runInterval(() => {
        if (activeChairs.size === 0) return;

        const now = Date.now();
        const allPlayers = world.getAllPlayers();

        for (const [playerId, chairData] of activeChairs.entries()) {
            const chairEntity = chairData.entity;
            const spawnTime = chairData.time;

            // 📌 修改 4：物理鎖定機制，每幀把豬傳送回 -0.2 的完美座標，徹底無視防卡牆機制
            try {
                if (chairEntity.isValid()) {
                    chairEntity.teleport(chairData.loc);
                }
            } catch (e) {}

            if (now - spawnTime < 1000) continue;

            const player = allPlayers.find(p => p.id === playerId);
            let shouldRemove = false;

            if (!player) {
                shouldRemove = true;
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