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
            // 🌟 核心防護：補上新版無括號 isValid，防止玩家瞬間登出導致伺服器崩潰
            if (!player || !player.isValid) continue;

            if (lastHurtTime.has(player.id)) {
                const lastHurt = lastHurtTime.get(player.id);

                if (now - lastHurt >= 10000) {
                    // 🌟 規範修正 1：強制加上 minecraft: 前綴
                    const healthComp = player.getComponent("minecraft:health");

                    if (healthComp && healthComp.currentValue < healthComp.effectiveMax) {
                        // 🌟 規範修正 2：藥水效果也加上 minecraft: 前綴，確保系統 100% 抓得到
                        player.addEffect("minecraft:regeneration", 20, { amplifier: 255, showParticles: false });

                        player.playSound("random.levelup", { pitch: 2.0, volume: 0.5 });
                        player.onScreenDisplay.setActionBar("§aOut of combat: Health rapidly restoring!§r");
                    }

                    lastHurtTime.delete(player.id);
                }
            } else {
                // 若不在戰鬥狀態中，但血量未滿 (例如剛登入伺服器、或是中毒扣血但沒觸發受傷事件)
                // 則在背景靜默給予恢復效果，不播放音效避免吵人
                const healthComp = player.getComponent("minecraft:health");
                if (healthComp && healthComp.currentValue < healthComp.effectiveMax) {
                    player.addEffect("minecraft:regeneration", 20, { amplifier: 255, showParticles: false });
                }
            }
        }
    }, 10);
}