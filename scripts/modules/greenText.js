import { world } from "@minecraft/server";

// Hypixel 顏文字全收錄 (含對應顏色代碼)
const HYPIXEL_EMOJIS = {
    "<3": "§c❤§r",
    ":star:": "§6✮§r",
    ":yes:": "§a✔§r",
    ":no:": "§c✖§r",
    ":java:": "§b☕§r",
    ":arrow:": "§e➜§r",
    ":shrug:": "§e¯\\_(ツ)_/¯",
    ":tableflip:": "§c(╯°□°）╯§f︵ ┻━┻",
    "o/": "§d( ﾟ◡ﾟ)/",
    "h/": "§eヽ(^◇^*)/",
    ":totem:": "§b☉§e_§b☉",
    ":typing:": "§e✎...",
    ":maths:": "§l§a√§e(§aπ§e+§ax§e)§a=§cL",
    ":snail:": "§e@§a'§e-§a'",
    ":thinking:": "§6(§a0§6.§ao§6?)",
    ":gimme:": "§b༼つ◕_◕༽つ",
    ":wizard:": "§e(§b'§e-§b'§e)⊃━§c☆ﾟ§d.*･｡ﾟ",
    ":pvp:": "§e⚔§r",
    ":peace:": "§a✌",
    ":oops:": "(✿◠‿◠)",
    ":puffer:": "§e<('O')>",
    ":sloth:": "§6(§8・§6⊝§8・§6)",
    ":dog:": "§6(ᵔᴥᵔ)",
    ":cat:": "§e=§b ＾● ⋏ ●＾ §e=",
    ":cute:": "§a(§e✿§a◠‿◠)",
    ":yey:": "§aヽ (◕◡◕) ﾉ",
    ":dab:": "§d<§eo§d/",
    ":dj:": "§5(§c⌐■_§e■§b)§3ノ§9♬",
    ":snow:": "§b☃§r",
    ":alien:": "§a⋎(▸▾◂)⋏",
    ":123:": "(ง ͠° ͟ل͜ ͡°)ง",
    ":yawn:": "(￣O￣;)",
    ":oof:": "§c§lOOF"
};

export function registerGreenText() {
    world.beforeEvents.chatSend.subscribe((event) => {
        let message = event.message;
        const player = event.sender;

        // 🌟 新增：專屬 Emoji 列表指令
        const lowerMsg = message.trim().toLowerCase();
        if (lowerMsg === "!emojis" || lowerMsg === "!emoji") {
            event.cancel = true; // 攔截指令，不要發送給全服

            let displayList = "§b=== 🌟 Emojis List 🌟 ===§r\n";
            const entries = Object.entries(HYPIXEL_EMOJIS);

            for (let i = 0; i < entries.length; i++) {
                const [key, value] = entries[i];
                displayList += `§e${key} §f➔ ${value}§r`;

                // 排版：每 3 個顏文字換一行，其餘用分隔線隔開
                if ((i + 1) % 3 === 0) {
                    displayList += "\n";
                } else if (i !== entries.length - 1) {
                    displayList += "  §8|  §r";
                }
            }

            // 只把這份超長選單私訊給要求查看的玩家
            player.sendMessage(displayList);
            return; // 結束執行，不再往下判定綠字或顏文字
        }

        let shouldCancel = false;

        // 1. 掃描並替換所有 Hypixel 顏文字
        for (const [key, value] of Object.entries(HYPIXEL_EMOJIS)) {
            if (message.includes(key)) {
                shouldCancel = true;
                message = message.replaceAll(key, value);
            }
        }

        // 2. 綠字判定 (首字為 >)
        if (message.startsWith(">")) {
            shouldCancel = true;
            message = "§a" + message;
        }

        // 3. 統一發送自訂訊息
        if (shouldCancel) {
            event.cancel = true;
            world.sendMessage(`<${player.name}> ${message}§r`);
        }
    });
}