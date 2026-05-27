import { world } from "@minecraft/server";

const deathMessages = {
    pvp_melee: [
        "§c{v} §ewas sent to the lobby by §a{a}§e.§r",
        "§c{v} §etook an L from §a{a}§e.§r",
        "§c{v} §ewas deleted by §a{a}§e.§r",
        "§a{a} §ewiped §c{v} §efrom existence.§r",
        "§c{v} §ejust got clapped by §a{a}§e.§r"
    ],
    pvp_projectile: [
        "§c{v} §ewas sniped by §a{a}§e.§r",
        "§c{v} §ecaught an arrow with their face from §a{a}§e.§r",
        "§a{a} §e360-no-scoped §c{v}§e.§r"
    ],
    fall: [
        "§c{v} §eforgot they didn't have an Elytra.§r",
        "§c{v} §eexperienced kinetic energy a bit too fast.§r",
        "§c{v} §edid a backflip into the ground.§r",
        "§c{v}§e's kneecaps were shattered.§r"
    ],
    void: [
        "§c{v} §eslipped into the void.§r",
        "§c{v} §ewas swallowed by the abyss.§r",
        "§c{v} §efell out of the world.§r"
    ],
    fire: [
        "§c{v} §ebecame human BBQ.§r",
        "§c{v} §etried to swim in lava.§r",
        "§c{v} §eis looking a little crispy.§r"
    ],
    explosion: [
        "§c{v} §ewent out with a bang.§r",
        "§c{v} §ewas blown to smithereens.§r"
    ],
    default: [
        "§c{v} §edied under mysterious circumstances.§r",
        "§c{v} §eflatlined.§r",
        "§c{v} §etook the easy way out.§r"
    ]
};

function getRandomMessage(array) {
    return array[Math.floor(Math.random() * array.length)];
}

export function registerDeathSystem() {
    world.afterEvents.entityDie.subscribe((event) => {
        const victim = event.deadEntity;
        if (victim.typeId !== "minecraft:player") return;

        const damageSource = event.damageSource;
        const cause = damageSource.cause;
        const attacker = damageSource.damagingEntity;

        let messageTemplate = "";

        if (attacker && attacker.typeId === "minecraft:player") {
            if (cause === "projectile") {
                messageTemplate = getRandomMessage(deathMessages.pvp_projectile);
            } else {
                messageTemplate = getRandomMessage(deathMessages.pvp_melee);
            }
        } else {
            switch (cause) {
                case "fall": messageTemplate = getRandomMessage(deathMessages.fall); break;
                case "void": messageTemplate = getRandomMessage(deathMessages.void); break;
                case "fire": case "fireTick": case "lava": case "magma": messageTemplate = getRandomMessage(deathMessages.fire); break;
                case "entityExplosion": case "blockExplosion": messageTemplate = getRandomMessage(deathMessages.explosion); break;
                default:
                    if (attacker) {
                        messageTemplate = `§c{v} §ewas slain by §a{a}§e.§r`;
                    } else {
                        messageTemplate = getRandomMessage(deathMessages.default);
                    }
                    break;
            }
        }

        // --- 核心修正：乾淨的攻擊者名稱 ---
        let attackerName = "Unknown";
        if (attacker) {
            if (attacker.typeId === "minecraft:player") {
                attackerName = attacker.name;
            } else {
                // 檢查怪物有沒有被玩家用命名牌取名 (儲存在 dynamicProperty 中)
                let originalName = attacker.getDynamicProperty("originalName");
                if (originalName && originalName !== "") {
                    attackerName = originalName;
                } else {
                    // 沒名字的怪物：將 minecraft:cave_spider 轉化成 Cave Spider
                    let rawType = attacker.typeId.replace("minecraft:", "");
                    attackerName = rawType.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
                }
            }
        }

        const finalMessage = messageTemplate
            .replace("{v}", victim.name)
            .replace("{a}", attackerName);

        world.sendMessage(finalMessage);
    });
}