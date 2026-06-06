import { world, system } from "@minecraft/server";

export function registerWhitelistSystem() {

    // ==========================================
    // 1. Join Check & Welcome System
    // ==========================================
    world.afterEvents.playerSpawn.subscribe((event) => {
        if (!event.initialSpawn) return;

        const player = event.player;
        const isEnabled = world.getDynamicProperty("wl_enabled");

        // 延遲發送歡迎訊息，避免被載入畫面吃掉
        const sendWelcome = (msg) => {
            system.runTimeout(() => {
                try {
                    player.sendMessage(msg);
                } catch (e) { }
            }, 20); // 20 ticks = 1 秒
        };

        // --- 管理員登入 ---
        if (player.hasTag("admin")) {
            const status = isEnabled ? "§aON" : "§cOFF";
            sendWelcome(`§e[System] §aWelcome back, Admin §f${player.name}§a! Whitelist is currently ${status}§a.`);

            // 讓其他在線上的管理員知道有別的管理員上線了
            system.run(() => {
                const allPlayers = world.getAllPlayers();
                for (const p of allPlayers) {
                    if (p.hasTag("admin") && p.id !== player.id) {
                        p.sendMessage(`§e[Whitelist] §aAdmin §f${player.name} §ahas joined the server.`);
                    }
                }
            });
            return;
        }

        // --- 白名單沒開，一般玩家登入 ---
        if (!isEnabled) {
            sendWelcome(`§e[System] §aWelcome to the server, §f${player.name}§a!`);
            return;
        }

        // --- 白名單審核邏輯 ---
        let whitelist = [];
        try {
            whitelist = JSON.parse(world.getDynamicProperty("wl_players") || "[]");
            if (whitelist.length > 0 && typeof whitelist[0] === "string") {
                whitelist = whitelist.map(name => ({ name: name, id: null }));
                world.setDynamicProperty("wl_players", JSON.stringify(whitelist));
            }
        } catch (e) {
            whitelist = [];
        }

        let entryById = whitelist.find(entry => entry.id === player.id);
        let entryByName = whitelist.find(entry => entry.name === player.name);

        let isApproved = false;
        let needsSave = false;

        if (entryById) {
            isApproved = true;
            if (entryById.name !== player.name) {
                entryById.name = player.name;
                needsSave = true;
            }
        } else if (entryByName) {
            isApproved = true;
            entryByName.id = player.id;
            needsSave = true;
        }

        if (needsSave) {
            world.setDynamicProperty("wl_players", JSON.stringify(whitelist));
        }

        // --- 審核結果處理 ---
        if (!isApproved) {
            system.run(() => {
                try {
                    const intruderName = player.name;
                    player.dimension.runCommandAsync(`kick "${intruderName}" §cServer is whitelisted. You are not on the list! Contact an administrator.§r`);

                    const allPlayers = world.getAllPlayers();
                    for (const p of allPlayers) {
                        if (p.hasTag("admin")) {
                            p.sendMessage(`§e[Whitelist] §cBlocked unauthorized join attempt from: §f${intruderName}`);
                        }
                    }
                } catch (e) { }
            });
        } else {
            // 名單內玩家成功登入的歡迎訊息
            sendWelcome(`§e[System] §aWelcome back to the whitelisted server, §f${player.name}§a!`);

            // 🌟 新增：通知所有在線上的管理員
            system.run(() => {
                const allPlayers = world.getAllPlayers();
                for (const p of allPlayers) {
                    // 只要對方有 admin 標籤，且不是玩家自己，就發送通知
                    if (p.hasTag("admin") && p.id !== player.id) {
                        p.sendMessage(`§e[Whitelist] §f${player.name} §ahas successfully joined the server.`);
                    }
                }
            });
        }
    });

    // ==========================================
    // 2. 原生斜線指令系統 (Script Event System)
    // ==========================================
    system.afterEvents.scriptEventReceive.subscribe((event) => {
        const id = event.id;
        if (!id.startsWith("wl:")) return;

        const player = event.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return;

        if (!player.hasTag("admin")) {
            player.sendMessage("§c[System] You do not have permission to use whitelist commands! Type /tag @s add admin first.");
            return;
        }

        const command = id.split(":")[1];

        let targetName = event.message.trim();
        targetName = targetName.replace(/^["']|["']$/g, '');

        let whitelist = [];
        try {
            whitelist = JSON.parse(world.getDynamicProperty("wl_players") || "[]");
            if (whitelist.length > 0 && typeof whitelist[0] === "string") {
                whitelist = whitelist.map(name => ({ name: name, id: null }));
            }
        } catch (e) { }

        switch (command) {
            case "on":
                world.setDynamicProperty("wl_enabled", true);
                player.sendMessage("§a[Whitelist] System enabled! Only whitelisted players can join.");
                break;

            case "off":
                world.setDynamicProperty("wl_enabled", false);
                player.sendMessage("§c[Whitelist] System disabled! Anyone can join.");
                break;

            case "add":
                if (!targetName) return player.sendMessage("§eUsage: /scriptevent wl:add <player>");
                if (!whitelist.some(entry => entry.name === targetName)) {
                    whitelist.push({ name: targetName, id: null });
                    world.setDynamicProperty("wl_players", JSON.stringify(whitelist));
                    player.sendMessage(`§a[Whitelist] Added §f${targetName} §ato the whitelist!`);
                } else {
                    player.sendMessage(`§e[Whitelist] §f${targetName} §eis already whitelisted.`);
                }
                break;

            case "remove":
                if (!targetName) return player.sendMessage("§eUsage: /scriptevent wl:remove <player>");
                const index = whitelist.findIndex(entry => entry.name === targetName);
                if (index > -1) {
                    whitelist.splice(index, 1);
                    world.setDynamicProperty("wl_players", JSON.stringify(whitelist));
                    player.sendMessage(`§c[Whitelist] Removed §f${targetName} §cfrom the whitelist!`);
                } else {
                    player.sendMessage(`§e[Whitelist] Could not find §f${targetName}.`);
                }
                break;

            case "list":
                const status = world.getDynamicProperty("wl_enabled") ? "§aON" : "§cOFF";
                const nameList = whitelist.map(entry => entry.name);
                player.sendMessage(`§b=== Whitelist (Status: ${status}§b) ===\n§f` + (nameList.length > 0 ? nameList.join("\n") : "No players whitelisted."));
                break;

            default:
                player.sendMessage("§e[Whitelist] Invalid command. Available commands:\n§7wl:on, wl:off, wl:add, wl:remove, wl:list");
                break;
        }
    });
}