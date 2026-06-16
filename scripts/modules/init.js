import { world, system } from "@minecraft/server";

export function initializeSystem() {
    // 🌟 核心修正：把會干涉世界運作的指令包進 system.run，延遲到腳本載入完畢後的第一幀執行
    system.run(() => {
        world.sendMessage("§e[System] Modules loaded successfully.§r");
        world.getDimension("overworld").runCommand("gamerule showdeathmessages false");
    });

    system.runTimeout(() => {
        try {
            let healthObj = world.scoreboard.getObjective("hp_display");
            if (!healthObj) {
                healthObj = world.scoreboard.addObjective("hp_display", "§c❤§r");
                world.scoreboard.setObjectiveAtDisplaySlot("belowname", { objective: healthObj });
            }
        } catch (e) {
            world.sendMessage(`§c[Scoreboard Error] ${e.message}§r`);
        }
    }, 20);
}