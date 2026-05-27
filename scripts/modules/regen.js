import { world, system } from "@minecraft/server";

// 用來記錄每個玩家「最後一次受傷的時間」
const lastHurtTime = new Map();

export function registerRegenSystem() {

    // 1. 監聽實體受傷事件
    world.afterEvents.entityHurt.subscribe((event) => {
        const entity = event.hurtEntity;

        // 只有玩家受傷才需要記錄
        if (entity.typeId === "minecraft:player") {
            lastHurtTime.set(entity.id, Date.now());
        }
    });

    // 2. 定期檢查脫戰狀態 (每 10 個 tick，也就是 0.5 秒檢查一次)
    system.runInterval(() => {
        const now = Date.now();
        const allPlayers = world.getAllPlayers();

        for (const player of allPlayers) {
            if (lastHurtTime.has(player.id)) {
                const lastHurt = lastHurtTime.get(player.id);

                // 如果現在時間距離最後一次受傷已經超過 10000 毫秒 (10秒)
                if (now - lastHurt >= 10000) {
                    const healthComp = player.getComponent("health");

                    if (healthComp) {
                        // 檢查是否還沒滿血
                        if (healthComp.currentValue < healthComp.effectiveMax) {
                            // 瞬間補滿
                            healthComp.setCurrentValue(healthComp.effectiveMax);

                            // 播放一個輕快的音效提示玩家已脫戰回血
                            player.playSound("random.levelup", { pitch: 2.0, volume: 0.5 });

                            // 顯示全英文提示
                            player.onScreenDisplay.setActionBar("§aOut of combat: Health fully restored!§r");
                        }
                    }

                    // 已經觸發過回血了，就把記錄刪掉，直到他下次受傷才重新計時
                    lastHurtTime.delete(player.id);
                }
            } else {
                // 如果玩家剛進伺服器，Map 裡沒有紀錄，但血量不滿，也可以幫他補滿
                const healthComp = player.getComponent("health");
                if (healthComp && healthComp.currentValue < healthComp.effectiveMax) {
                    healthComp.setCurrentValue(healthComp.effectiveMax);
                }
            }
        }
    }, 10);
}