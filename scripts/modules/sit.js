import { world, system, ItemStack, EquipmentSlot } from "@minecraft/server"; // 🌟 注意這裡引入了 EquipmentSlot

const activeChairs = new Map();

export function registerSitSystem() {

    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const player = event.player;
        const block = event.block;

        if (player.isSneaking) return;

        // 🌟 核心防護：偵測是否處於 SpeedBuild 模式
        const equippable = player.getComponent("equippable");
        if (equippable) {
            const headItem = equippable.getEquipmentSlot(EquipmentSlot.Head).getItem();
            // 如果玩家頭上戴著仙人掌，直接放行，絕對不觸發坐下！
            if (headItem && headItem.typeId === "minecraft:cactus") {
                return;
            }
        }

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

                const spawnLoc = {
                    x: block.location.x + 0.5,
                    y: block.location.y - 0.2,
                    z: block.location.z + 0.5
                };

                const chair = player.dimension.spawnEntity("minecraft:pig", spawnLoc);
                chair.addTag(`chair_${player.id}`);

                chair.runCommandAsync("event entity @s minecraft:on_saddled").catch(() => { });

                chair.addEffect("invisibility", 999999, { amplifier: 255, showParticles: false });
                chair.addEffect("slowness", 999999, { amplifier: 255, showParticles: false });
                chair.addEffect("resistance", 999999, { amplifier: 255, showParticles: false });

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

    system.runInterval(() => {
        if (activeChairs.size === 0) return;

        const now = Date.now();
        const allPlayers = world.getAllPlayers();

        for (const [playerId, chairData] of activeChairs.entries()) {
            const chairEntity = chairData.entity;
            const spawnTime = chairData.time;

            // 物理鎖定機制
            try {
                if (chairEntity.isValid()) {
                    chairEntity.teleport(chairData.loc);
                }
            } catch (e) { }

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