import { world, system, EquipmentSlot } from "@minecraft/server";

const activeChairs = new Map();

export function registerSitSystem() {

    system.run(() => {
        for (const dimName of ["overworld", "nether", "the_end"]) {
            try {
                const dim = world.getDimension(dimName);
                const orphanedChairs = dim.getEntities({ tags: ["custom_chair"] });
                for (const chair of orphanedChairs) {
                    chair.remove();
                }
            } catch (e) { }
        }
    });

    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const player = event.player;
        const block = event.block;

        if (player.isSneaking) return;

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

        let sitsOnTop = false;
        let isWaterlogged = false;

        if (isSlab && typeId.includes("double")) {
            sitsOnTop = true;
        }

        try {
            // 🌟 1. 現代屬性判斷法
            if (block.isWaterlogged) {
                isWaterlogged = true;
            }

            // 🌟 2. 舊版狀態判斷法
            const states = block.permutation.getAllStates();
            if (states["waterlogged"] === true || states["minecraft:waterlogged"] === true) {
                isWaterlogged = true;
            }

            // 🌟 3. 用戶提供的終極液體判斷法 (完美防漏)
            if (block.getLiquid && block.getLiquid() && block.getLiquid().typeId === "minecraft:water") {
                isWaterlogged = true;
            }

            if (isStair && states["upside_down_bit"] === true) sitsOnTop = true;
            if (isSlab && !sitsOnTop) {
                if (states["minecraft:vertical_half"] === "top") sitsOnTop = true;
                if (states["minecraft:full_block_bit"] === true) sitsOnTop = true;
            }
        } catch (e) { }

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
            try {
                const oldChairs = dim.getEntities({ tags: [`chair_${player.id}`] });
                for (const oldChair of oldChairs) {
                    oldChair.remove();
                }
            } catch (e) { }
            activeChairs.delete(player.id);

            const sitsOnTopOffset = sitsOnTop ? 0.3 : -0.2;
            const horseOffset = isWaterlogged ? -0.6 : 0;

            const spawnLoc = {
                x: x + 0.5,
                y: y + sitsOnTopOffset + horseOffset,
                z: z + 0.5
            };

            const mountType = isWaterlogged ? "minecraft:skeleton_horse" : "minecraft:pig";
            const chair = dim.spawnEntity(mountType, spawnLoc);

            chair.addTag(`chair_${player.id}`);
            chair.addTag("custom_chair");

            if (!isWaterlogged) {
                try { chair.runCommand("event entity @s minecraft:on_saddled") } catch (e) { };
            }

            chair.addEffect("invisibility", 999999, { amplifier: 255, showParticles: false });
            chair.addEffect("slowness", 999999, { amplifier: 255, showParticles: false });
            chair.addEffect("resistance", 999999, { amplifier: 255, showParticles: false });

            activeChairs.set(player.id, { entity: chair, time: Date.now(), loc: spawnLoc, blockLoc: { x, y, z } });

            system.runTimeout(() => {
                const rideCommand = `ride @a[name="${player.name}"] start_riding @e[tag=chair_${player.id},c=1]`;

                try { player.dimension.runCommand(rideCommand); } catch (e) {
                    try { chair.remove(); } catch (err) { }
                    activeChairs.delete(player.id);
                }
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
            const player = allPlayers.find(p => p.id === playerId);

            try {
                if (chairEntity && chairEntity.isValid) {
                    if (player && player.isValid) {
                        const rot = player.getRotation();
                        chairEntity.teleport(chairData.loc, { rotation: { x: 0, y: rot.y } });

                        if (chairEntity.typeId === "minecraft:skeleton_horse") {
                            try { chairEntity.runCommand("stopsound @a[r=5] mob.skeleton_horse.ambient") } catch (e) { }
                            try { chairEntity.runCommand("stopsound @a[r=5] mob.skeleton_horse.water") } catch (e) { }
                        } else {
                            try { chairEntity.runCommand("stopsound @a[r=5] mob.pig.say") } catch (e) { }
                            try { chairEntity.runCommand("stopsound @a[r=5] mob.pig.step") } catch (e) { }
                        }
                    } else {
                        chairEntity.teleport(chairData.loc);
                    }
                }
            } catch (e) { }

            if (now - spawnTime < 1000) continue;

            let shouldRemove = false;

            if (!player || !player.isValid) {
                shouldRemove = true;
            } else {
                try {
                    const dx = player.location.x - chairEntity.location.x;
                    const dy = player.location.y - chairEntity.location.y;
                    const dz = player.location.z - chairEntity.location.z;
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    if (distance > 1.8 || player.isSneaking) {
                        shouldRemove = true;
                    } else {
                        const currentBlock = player.dimension.getBlock(chairData.blockLoc);
                        if (!currentBlock || (!currentBlock.typeId.includes("stairs") && !currentBlock.typeId.includes("slab"))) {
                            shouldRemove = true;
                        }
                    }
                } catch (e) {
                    shouldRemove = true;
                }
            }

            if (shouldRemove) {
                try { if (chairEntity && chairEntity.isValid) chairEntity.remove(); } catch (e) { }
                activeChairs.delete(playerId);
            }
        }
    }, 1);
}