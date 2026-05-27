import { world, system } from "@minecraft/server";

const lastHurtTime = new Map();

export function registerRegenSystem() {

    world.afterEvents.entityHurt.subscribe((event) => {
        const entity = event.hurtEntity;
        if (entity.typeId === "minecraft:player") {
            lastHurtTime.set(entity.id, Date.now());
        }
    });

    system.runInterval(() => {
        const now = Date.now();
        const allPlayers = world.getAllPlayers();

        for (const player of allPlayers) {
            if (lastHurtTime.has(player.id)) {
                const lastHurt = lastHurtTime.get(player.id);

                if (now - lastHurt >= 10000) {
                    const healthComp = player.getComponent("health");

                    if (healthComp && healthComp.currentValue < healthComp.effectiveMax) {
                        // 🌟 核心修改：給予 20 tick (1秒) 的恢復 255 效果，隱藏粒子
                        player.addEffect("regeneration", 20, { amplifier: 255, showParticles: false });

                        player.playSound("random.levelup", { pitch: 2.0, volume: 0.5 });
                        player.onScreenDisplay.setActionBar("§aOut of combat: Health rapidly restoring!§r");
                    }

                    lastHurtTime.delete(player.id);
                }
            } else {
                // 若不在戰鬥狀態中，但血量未滿 (例如剛登入伺服器、或是中毒扣血但沒觸發受傷事件)
                // 則在背景靜默給予恢復效果，不播放音效避免吵人
                const healthComp = player.getComponent("health");
                if (healthComp && healthComp.currentValue < healthComp.effectiveMax) {
                    player.addEffect("regeneration", 20, { amplifier: 255, showParticles: false });
                }
            }
        }
    }, 10);
}