import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";

const flyingKnives = new Set();
const chargingPlayers = new Map();

export function registerKnifeSystem() {

    // ==========================================
    // 🌟 伺服器重啟/Reload 大掃除系統
    // ==========================================
    system.run(() => {
        for (const dimName of ["overworld", "nether", "the_end"]) {
            try {
                const dim = world.getDimension(dimName);
                const orphanedKnives = dim.getEntities({ tags: ["flying_knife"] });
                for (const knife of orphanedKnives) {
                    try {
                        const ownerId = knife.getDynamicProperty("ownerId");
                        let returned = false;

                        if (ownerId) {
                            const owner = world.getAllPlayers().find(p => p.id === ownerId);
                            if (owner) {
                                const inv = owner.getComponent("inventory").container;
                                inv.addItem(new ItemStack("minecraft:iron_sword", 1));
                                owner.playSound("random.pop", { pitch: 1.5 });
                                owner.onScreenDisplay.setActionBar("§aKnife returned (System Reload)!");
                                returned = true;
                            }
                        }

                        if (!returned) {
                            dim.spawnItem(new ItemStack("minecraft:iron_sword", 1), knife.location);
                        }
                    } catch (e) { }

                    knife.remove();
                }
            } catch (e) { }
        }
    });

    world.afterEvents.itemUse.subscribe((event) => {
        const player = event.source;
        const item = event.itemStack;

        if (item.typeId !== "minecraft:iron_sword") return;

        if (!chargingPlayers.has(player.id)) {
            chargingPlayers.set(player.id, {
                player: player,
                ticks: 0
            });
        }
    });

    system.runInterval(() => {

        // --- A. 蓄力系統 ---
        for (const [playerId, data] of chargingPlayers.entries()) {
            const player = data.player;

            if (!player.isValid()) {
                chargingPlayers.delete(playerId);
                continue;
            }

            const equippable = player.getComponent("equippable");
            const mainhand = equippable?.getEquipmentSlot(EquipmentSlot.Mainhand);

            if (!mainhand || !mainhand.hasItem() || mainhand.getItem().typeId !== "minecraft:iron_sword") {
                player.onScreenDisplay.setActionBar("§cCharge Cancelled");
                chargingPlayers.delete(playerId);
                continue;
            }

            const maxTicks = 10;
            const progress = Math.floor((data.ticks / maxTicks) * 10);
            const bar = "§a■".repeat(progress) + "§7■".repeat(10 - progress);
            player.onScreenDisplay.setActionBar(`§eCharging: ${bar}`);

            if (data.ticks === 0) player.playSound("note.hat", { pitch: 1.0, volume: 1.0 });
            if (data.ticks === 4) player.playSound("note.hat", { pitch: 1.3, volume: 1.0 });
            if (data.ticks === 8) player.playSound("note.hat", { pitch: 1.6, volume: 1.0 });

            data.ticks++;

            if (data.ticks >= 10) {
                const item = mainhand.getItem();
                if (item.amount > 1) {
                    item.amount -= 1;
                    mainhand.setItem(item);
                } else {
                    mainhand.setItem(undefined);
                }

                const headLoc = player.getHeadLocation();
                const viewDir = player.getViewDirection();
                const playerRot = player.getRotation();
                const speed = 1.5;

                player.playSound("random.bow", { pitch: 0.8, volume: 1.0 });

                let expectedTicks = 100;
                try {
                    const rayHit = player.dimension.getBlockFromRay(headLoc, viewDir, { maxDistance: 150 });
                    if (rayHit) {
                        const hitLoc = rayHit.faceLocation || rayHit.block.location;
                        const dx = hitLoc.x - headLoc.x;
                        const dy = hitLoc.y - headLoc.y;
                        const dz = hitLoc.z - headLoc.z;
                        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        expectedTicks = Math.max(1, Math.ceil((dist - 1.0) / speed));
                    }
                } catch (e) { }

                const leftYawRad = (playerRot.y - 90) * (Math.PI / 180);
                const leftX = -Math.sin(leftYawRad);
                const leftZ = Math.cos(leftYawRad);

                const startStandLoc = {
                    x: headLoc.x + (leftX * 0.5),
                    y: headLoc.y - 1,
                    z: headLoc.z + (leftZ * 0.5)
                };

                try {
                    const stand = player.dimension.spawnEntity("minecraft:armor_stand", startStandLoc);

                    stand.addTag("flying_knife");
                    stand.setDynamicProperty("ownerId", player.id);

                    try {
                        stand.addEffect("minecraft:invisibility", 99999, { amplifier: 255, showParticles: false });
                    } catch (e) { }

                    system.runTimeout(() => {
                        try {
                            stand.runCommandAsync("replaceitem entity @s slot.weapon.mainhand 0 iron_sword 1");
                        } catch (e) { }
                        try {
                            stand.runCommandAsync("playanimation @s animation.armor_stand.no_pose a 99999");
                        } catch (e) { }
                    }, 1);

                    flyingKnives.add({
                        entity: stand,
                        dim: player.dimension,
                        centerLoc: { x: headLoc.x, y: headLoc.y, z: headLoc.z },
                        leftX: leftX,
                        leftZ: leftZ,
                        rotY: playerRot.y,
                        rotX: playerRot.x,
                        viewDir: viewDir,
                        dir: { x: viewDir.x * speed, y: viewDir.y * speed, z: viewDir.z * speed },
                        ownerId: player.id,
                        typeId: "minecraft:iron_sword",
                        age: 0,
                        maxAge: expectedTicks
                    });
                } catch (e) { }

                chargingPlayers.delete(playerId);
            }
        }

        // --- B. 飛刀物理系統 ---
        for (const knife of flyingKnives) {
            knife.age++;
            let shouldReturn = false;

            if (!knife.entity.isValid() || knife.age > 100) {
                shouldReturn = true;
            }

            if (!shouldReturn) {
                knife.centerLoc.x += knife.dir.x;
                knife.centerLoc.y += knife.dir.y;
                knife.centerLoc.z += knife.dir.z;

                const tipLoc = {
                    x: knife.centerLoc.x + (knife.viewDir.x * 1.0),
                    y: knife.centerLoc.y + (knife.viewDir.y * 1.0),
                    z: knife.centerLoc.z + (knife.viewDir.z * 1.0)
                };

                const standLoc = {
                    x: knife.centerLoc.x + (knife.leftX * 0.5),
                    y: knife.centerLoc.y - 1,
                    z: knife.centerLoc.z + (knife.leftZ * 0.5)
                };

                try {
                    knife.dim.spawnParticle("minecraft:basic_crit_particle", tipLoc);
                } catch (e) { }

                // 更新玩家畫面的 CD 進度條
                try {
                    const owner = world.getAllPlayers().find(p => p.id === knife.ownerId);
                    if (owner) {
                        const remainingTicks = Math.max(0, knife.maxAge - knife.age);
                        const remainingSecs = (remainingTicks / 20).toFixed(1);

                        let progress = Math.ceil((remainingTicks / knife.maxAge) * 10);
                        if (progress < 0) progress = 0;
                        if (progress > 10) progress = 10;

                        const bar = "§c■".repeat(progress) + "§7■".repeat(10 - progress);
                        owner.onScreenDisplay.setActionBar(`§eCooldown: ${bar} §f${remainingSecs}s`);
                    }
                } catch (e) { }

                // 精準撞牆偵測
                try {
                    const block = knife.dim.getBlock(tipLoc);
                    if (block && !block.isAir && !block.typeId.includes("water") && !block.typeId.includes("lava")) {
                        shouldReturn = true;
                        knife.dim.playSound("item.trident.hit_ground", tipLoc);
                    }
                } catch (e) {
                    shouldReturn = true;
                }

                // 🌟 暴力的生物撞擊與扣血偵測
                if (!shouldReturn) {
                    try {
                        // 🌟 把判定半徑加大到 2.0！防止飛刀速度太快直接穿透生物
                        const targets = knife.dim.getEntities({ location: tipLoc, maxDistance: 2.0 });
                        for (const target of targets) {
                            if (target.id !== knife.ownerId && target.typeId !== "minecraft:armor_stand" && target.typeId !== "minecraft:item") {

                                const hasHealth = target.getComponent("minecraft:health") || target.getComponent("health");

                                if (hasHealth) {
                                    shouldReturn = true;

                                    // 🌟 找回主人，並附加完整的傷害來源，保證扣血生效！
                                    const owner = world.getAllPlayers().find(p => p.id === knife.ownerId);
                                    try {
                                        target.applyDamage(40, {
                                            cause: "projectile",
                                            damagingEntity: owner
                                        });
                                    } catch (err) {
                                        // 如果上面的完整寫法報錯，至少硬扣他血
                                        try { target.applyDamage(40); } catch (e) { }
                                    }

                                    // 命中時播放音效並噴出爆擊粒子
                                    knife.dim.playSound("item.trident.hit", tipLoc);
                                    knife.dim.spawnParticle("minecraft:critical_hit_emitter", tipLoc);
                                    break;
                                }
                            }
                        }
                    } catch (e) { }
                }

                // 同步盔甲架位置
                if (!shouldReturn) {
                    try {
                        knife.entity.teleport(standLoc, { rotation: { x: knife.rotX, y: knife.rotY } });
                    } catch (e) { }
                }
            }

            // 處理回手邏輯
            if (shouldReturn) {
                try {
                    if (knife.entity && knife.entity.isValid()) knife.entity.remove();

                    const owner = world.getAllPlayers().find(p => p.id === knife.ownerId);
                    if (owner) {
                        const inv = owner.getComponent("inventory").container;
                        inv.addItem(new ItemStack(knife.typeId, 1));

                        owner.playSound("random.pop", { pitch: 1.5 });
                        owner.onScreenDisplay.setActionBar("§aKnife returned!");
                    }
                } catch (e) { }

                flyingKnives.delete(knife);
            }
        }
    }, 1);
}