import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";

const flyingKnives = new Set();
const chargingPlayers = new Map();

export function registerKnifeSystem() {
    system.run(() => {
        for (const dimName of ["overworld", "nether", "the_end"]) {
            try {
                const dim = world.getDimension(dimName);
                const orphanedKnives = dim.getEntities({ tags: ["flying_knife"] });
                for (const knife of orphanedKnives) {
                    try {
                        const ownerId = knife.getDynamicProperty("ownerId");
                        const triggerItem = knife.getDynamicProperty("triggerItem") || "minecraft:iron_sword";
                        let returned = false;

                        if (ownerId) {
                            const owner = world.getAllPlayers().find(p => p.id === ownerId);
                            if (owner) {
                                const inv = owner.getComponent("inventory").container;
                                try {
                                    if (triggerItem === "minecraft:nether_star") {
                                        inv.addItem(new ItemStack("minecraft:iron_sword", 1));
                                        const star = new ItemStack("minecraft:nether_star", 1);
                                        star.nameTag = "§r§cThrow §6Knife";
                                        inv.addItem(star);
                                    } else {
                                        inv.addItem(new ItemStack("minecraft:iron_sword", 1));
                                    }
                                } catch (e) { }
                                owner.playSound("random.pop", { pitch: 1.5 });
                                owner.onScreenDisplay.setActionBar("§aKnife returned (System Reload)!");
                                returned = true;
                            }
                        }

                        if (!returned) {
                            if (triggerItem === "minecraft:nether_star") {
                                dim.spawnItem(new ItemStack("minecraft:iron_sword", 1), knife.location);
                                const star = new ItemStack("minecraft:nether_star", 1);
                                star.nameTag = "§r§cThrow §6Knife";
                                dim.spawnItem(star, knife.location);
                            } else {
                                dim.spawnItem(new ItemStack("minecraft:iron_sword", 1), knife.location);
                            }
                        }
                    } catch (e) { }

                    knife.remove();
                }
            } catch (e) { }
        }
    });

    // ==========================================
    // 1. 觸發系統 (鐵劍純右鍵 / 地獄之星雙鍵)
    // ==========================================
    function handleRightClick(player, item) {
        if (!item) return;
        if (item.typeId !== "minecraft:iron_sword" && item.typeId !== "minecraft:nether_star") return;

        if (item.typeId === "minecraft:nether_star") {
            const inv = player.getComponent("inventory").container;
            let hasSword = false;
            for (let i = 0; i < inv.size; i++) {
                const invItem = inv.getItem(i);
                if (invItem && invItem.typeId === "minecraft:iron_sword") {
                    hasSword = true;
                    break;
                }
            }
            if (!hasSword) {
                player.onScreenDisplay.setActionBar("§cNo Iron Sword found!");
                return;
            }
        }

        if (chargingPlayers.has(player.id)) {
            chargingPlayers.delete(player.id);
            player.onScreenDisplay.setActionBar("§cCharge Cancelled");
            player.playSound("note.bass", { pitch: 0.8, volume: 1.0 });
            return;
        }

        chargingPlayers.set(player.id, {
            player: player,
            ticks: 0,
            triggerItem: item.typeId
        });
    }

    world.afterEvents.itemUse.subscribe((event) => handleRightClick(event.source, event.itemStack));
    world.afterEvents.itemUseOn.subscribe((event) => handleRightClick(event.source, event.itemStack));

    function handleLeftClick(player) {
        if (chargingPlayers.has(player.id)) return;
        const equippable = player.getComponent("equippable");
        const mainhand = equippable?.getEquipmentSlot(EquipmentSlot.Mainhand)?.getItem();

        if (mainhand && mainhand.typeId === "minecraft:nether_star") {
            const inv = player.getComponent("inventory").container;
            let hasSword = false;
            for (let i = 0; i < inv.size; i++) {
                const invItem = inv.getItem(i);
                if (invItem && invItem.typeId === "minecraft:iron_sword") {
                    hasSword = true;
                    break;
                }
            }
            if (!hasSword) {
                player.onScreenDisplay.setActionBar("§cNo Iron Sword found!");
                return;
            }

            chargingPlayers.set(player.id, {
                player: player,
                ticks: 0,
                triggerItem: mainhand.typeId
            });
        }
    }

    world.afterEvents.entityHitBlock.subscribe((e) => {
        if (e.damagingEntity.typeId === "minecraft:player") handleLeftClick(e.damagingEntity);
    });

    world.afterEvents.entityHitEntity.subscribe((e) => {
        if (e.damagingEntity.typeId === "minecraft:player") handleLeftClick(e.damagingEntity);
    });

    // ==========================================
    // 2. 蓄力引擎與飛刀物理迴圈
    // ==========================================
    system.runInterval(() => {

        for (const [playerId, data] of chargingPlayers.entries()) {
            const player = data.player;

            if (!player.isValid()) {
                chargingPlayers.delete(playerId);
                continue;
            }

            const equippable = player.getComponent("equippable");
            const mainhand = equippable?.getEquipmentSlot(EquipmentSlot.Mainhand);
            const currentItem = mainhand?.getItem();

            if (!currentItem || currentItem.typeId !== data.triggerItem) {
                player.onScreenDisplay.setActionBar("§cCharge Cancelled");
                chargingPlayers.delete(playerId);
                continue;
            }

            const maxTicks = 10;
            const progress = Math.floor((data.ticks / maxTicks) * 10);
            const remainingSecs = ((maxTicks - data.ticks) / 20).toFixed(1);
            const bar = "§a■".repeat(progress) + "§c■".repeat(10 - progress);
            player.onScreenDisplay.setActionBar(`§6CHARGING §8[ ${bar} §8] §6${remainingSecs}s`);

            if (data.ticks === 0) player.playSound("note.hat", { pitch: 1.0, volume: 1.0 });
            if (data.ticks === 4) player.playSound("note.hat", { pitch: 1.3, volume: 1.0 });
            if (data.ticks === 8) player.playSound("note.hat", { pitch: 1.6, volume: 1.0 });

            data.ticks++;

            if (data.ticks >= 10) {
                const inv = player.getComponent("inventory").container;

                if (data.triggerItem === "minecraft:nether_star") {
                    let swordRemoved = false;
                    for (let i = 0; i < inv.size; i++) {
                        const invItem = inv.getItem(i);
                        if (invItem && invItem.typeId === "minecraft:iron_sword") {
                            if (invItem.amount > 1) {
                                invItem.amount -= 1;
                                inv.setItem(i, invItem);
                            } else {
                                inv.setItem(i, undefined);
                            }
                            swordRemoved = true;
                            break;
                        }
                    }

                    if (!swordRemoved) {
                        player.onScreenDisplay.setActionBar("§cCharge Cancelled: No Sword!");
                        chargingPlayers.delete(playerId);
                        continue;
                    }
                }

                if (currentItem.amount > 1) {
                    currentItem.amount -= 1;
                    mainhand.setItem(currentItem);
                } else {
                    mainhand.setItem(undefined);
                }

                const headLoc = player.getHeadLocation();
                const viewDir = player.getViewDirection();
                const playerRot = player.getRotation();
                const speed = 1.5;

                const randomPitch = 0.8 + Math.random() * 0.4;
                player.playSound("mob.enderdragon.flap", { pitch: randomPitch, volume: 1.0 });

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

                        if (expectedTicks > 100) expectedTicks = 100;
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
                    stand.setDynamicProperty("triggerItem", data.triggerItem);

                    try {
                        stand.addEffect("minecraft:invisibility", 99999, { amplifier: 255, showParticles: false });
                    } catch (e) { }

                    system.runTimeout(() => {
                        try { stand.runCommandAsync("replaceitem entity @s slot.weapon.mainhand 0 iron_sword 1"); } catch (e) { }
                        try { stand.setProperty("minecraft:pose_index", 0); } catch (e) { }
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
                        triggerItem: data.triggerItem,
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

                try { knife.dim.spawnParticle("minecraft:basic_crit_particle", tipLoc); } catch (e) { }

                try {
                    const owner = world.getAllPlayers().find(p => p.id === knife.ownerId);
                    if (owner) {
                        const remainingTicks = Math.max(0, knife.maxAge - knife.age);
                        const remainingSecs = (remainingTicks / 20).toFixed(1);

                        let progress = Math.ceil((remainingTicks / knife.maxAge) * 10);
                        if (progress < 0) progress = 0;
                        if (progress > 10) progress = 10;

                        const bar = "§c■".repeat(progress) + "§a■".repeat(10 - progress);
                        owner.onScreenDisplay.setActionBar(`§6COOLDOWN §8[ ${bar} §8] §6${remainingSecs}s`);
                    }
                } catch (e) { }

                try {
                    const block = knife.dim.getBlock(tipLoc);
                    if (block && !block.isAir && !block.typeId.includes("water") && !block.typeId.includes("lava")) {
                        shouldReturn = true;
                        knife.dim.playSound("item.trident.hit_ground", tipLoc);
                    }
                } catch (e) {
                    shouldReturn = true;
                }

                if (!shouldReturn) {
                    try {
                        const targets = knife.dim.getEntities({ location: tipLoc, maxDistance: 2.0 });
                        for (const target of targets) {
                            if (target.id !== knife.ownerId && target.typeId !== "minecraft:armor_stand" && target.typeId !== "minecraft:item") {

                                const hasHealth = target.getComponent("minecraft:health") || target.getComponent("health");

                                if (hasHealth) {
                                    shouldReturn = true;

                                    const owner = world.getAllPlayers().find(p => p.id === knife.ownerId);
                                    try {
                                        target.applyDamage(40, { cause: "projectile", damagingEntity: owner });
                                    } catch (err) {
                                        try { target.applyDamage(40); } catch (e) { }
                                    }

                                    knife.dim.playSound("item.trident.hit", tipLoc);
                                    knife.dim.spawnParticle("minecraft:critical_hit_emitter", tipLoc);
                                    break;
                                }
                            }
                        }
                    } catch (e) { }
                }

                if (!shouldReturn) {
                    try {
                        knife.entity.teleport(standLoc, { rotation: { x: knife.rotX, y: knife.rotY } });
                        knife.entity.setProperty("minecraft:pose_index", 0);
                    } catch (e) { }
                }
            }

            if (shouldReturn) {
                try {
                    if (knife.entity && knife.entity.isValid()) knife.entity.remove();

                    const owner = world.getAllPlayers().find(p => p.id === knife.ownerId);
                    if (owner) {
                        const inv = owner.getComponent("inventory").container;

                        try {
                            if (knife.triggerItem === "minecraft:nether_star") {
                                inv.addItem(new ItemStack("minecraft:iron_sword", 1));
                                const star = new ItemStack("minecraft:nether_star", 1);
                                star.nameTag = "§r§cThrow §6Knife";
                                inv.addItem(star);
                            } else {
                                inv.addItem(new ItemStack("minecraft:iron_sword", 1));
                            }
                        } catch (e) {
                            const dim = owner.dimension;
                            if (knife.triggerItem === "minecraft:nether_star") {
                                dim.spawnItem(new ItemStack("minecraft:iron_sword", 1), owner.location);
                                const star = new ItemStack("minecraft:nether_star", 1);
                                star.nameTag = "§r§cThrow §6Knife";
                                dim.spawnItem(star, owner.location);
                            } else {
                                dim.spawnItem(new ItemStack("minecraft:iron_sword", 1), owner.location);
                            }
                        }

                        owner.playSound("random.pop", { pitch: 1.5 });
                        owner.onScreenDisplay.setActionBar("§aKnife returned!");
                    }
                } catch (e) { }

                flyingKnives.delete(knife);
            }
        }
    }, 1);
}