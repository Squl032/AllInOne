import { world, system } from "@minecraft/server";

export function registerCombatSystem() {
    world.afterEvents.entityHurt.subscribe((event) => {
        const victim = event.hurtEntity;
        const damageSource = event.damageSource;
        const attacker = damageSource.damagingEntity;

        system.run(() => {
            try {
                // 🌟 新版 API 安全檢查：isValid 不用括號是真的
                if (!victim || !victim.isValid) return;
                if (attacker && !attacker.isValid) return;

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
                            victim.nameTag = `${cleanType}\n§c${currentHp} ❤§r`;
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