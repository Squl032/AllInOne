import { world, system } from "@minecraft/server";

export function registerCombatSystem() {
    world.afterEvents.entityHurt.subscribe((event) => {
        const victim = event.hurtEntity;
        const damageSource = event.damageSource;
        const attacker = damageSource.damagingEntity;

        system.run(() => {
            try {
                // --- 物理擊退 ---
                if (attacker && attacker.typeId === "minecraft:player") {
                    let dx = victim.location.x - attacker.location.x;
                    let dz = victim.location.z - attacker.location.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    const force = Math.PI / 10 + 0.043;
                    const verticalBoost = Math.PI / 10 + 0.0785;

                    if (distance > 0) {
                        victim.clearVelocity();
                        victim.applyImpulse({ x: (dx / distance) * verticalBoost, y: force, z: (dz / distance) * verticalBoost });
                    }
                }

                // --- 顯示層 ---
                const healthComp = victim.getComponent("minecraft:health");
                if (healthComp) {
                    const currentHp = Math.round(healthComp.currentValue);

                    if (victim.typeId === "minecraft:player") {
                        const healthObj = world.scoreboard.getObjective("hp_display");
                        if (healthObj) healthObj.setScore(victim, currentHp);
                    } else {
                        let originalName = victim.getDynamicProperty("originalName");
                        if (originalName === undefined) {
                            originalName = victim.nameTag;
                            victim.setDynamicProperty("originalName", originalName);
                        }

                        if (originalName === "") {
                            const cleanType = victim.typeId.replace('minecraft:', '').toUpperCase();
                            victim.nameTag = `${cleanType}\n§c${currentHp} ❤`;
                        } else if (attacker && attacker.typeId === "minecraft:player") {
                            attacker.onScreenDisplay.setActionBar(`Target: §r${originalName} §f- §a${currentHp} §c❤`);
                        }
                    }
                }
            } catch (e) {
                world.sendMessage(`§c[Combat Error] ${e.name}: ${e.message}§r`);
            }
        });
    });
}