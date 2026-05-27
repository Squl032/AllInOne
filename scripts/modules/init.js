import { world, system } from "@minecraft/server";

export function initializeSystem() {
    world.sendMessage("§e[System] Modules loaded successfully.§r");

    world.getDimension("overworld").runCommandAsync("gamerule showdeathmessages false");

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