import { world, system, EquipmentSlot } from "@minecraft/server";

// 暫存記憶體
let faucetCache = [];
let isFaucetCacheLoaded = false;

// 防連點冷卻記憶體
const interactCooldown = new Map();

function saveFaucets() {
    world.setDynamicProperty("custom_faucets", JSON.stringify(faucetCache));
}

function loadFaucets() {
    if (isFaucetCacheLoaded) return;
    try {
        faucetCache = JSON.parse(world.getDynamicProperty("custom_faucets") || "[]");
    } catch (e) {
        faucetCache = [];
    }
    isFaucetCacheLoaded = true;
}

export function registerFaucetSystem() {
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const block = event.block;
        const typeId = block.typeId;

        if (typeId !== "minecraft:lever" && typeId !== "minecraft:tripwire_hook") return;

        const player = event.player;
        if (!player || !player.isValid) return;

        const now = Date.now();
        const lastTime = interactCooldown.get(player.id) || 0;

        const equippable = player.getComponent("equippable");
        if (!equippable) return;
        const item = equippable.getEquipmentSlot(EquipmentSlot.Mainhand).getItem();

        loadFaucets();

        const locKey = `${block.location.x},${block.location.y},${block.location.z},${player.dimension.id}`;
        const existingIndex = faucetCache.findIndex(f => f.key === locKey);

        // ==========================================
        // 🛠️ 施工模式：玩家蹲下 + 手持海磷水晶
        // ==========================================
        if (player.isSneaking && item && item.typeId === "minecraft:prismarine_crystals") {
            event.cancel = true;

            if (now - lastTime < 500) return;
            interactCooldown.set(player.id, now);

            system.run(() => {
                if (!player || !player.isValid) return;

                if (existingIndex > -1) {
                    faucetCache.splice(existingIndex, 1);
                    saveFaucets();
                    player.sendMessage("§c[Plumbing] Removed water connection from this fixture.");
                    player.onScreenDisplay.setActionBar("§c🔧 Connection: REMOVED");
                    player.playSound("random.break");
                } else {
                    faucetCache.push({
                        key: locKey,
                        x: block.location.x,
                        y: block.location.y,
                        z: block.location.z,
                        dim: player.dimension.id,
                        isOn: false
                    });
                    saveFaucets();
                    player.sendMessage("§b[Plumbing] Fixture connected! Right-click to toggle water.§r");
                    player.onScreenDisplay.setActionBar("§b🔧 Connection: OK");
                    player.playSound("random.levelup");
                }
            });
            return;
        }

        // ==========================================
        // 🚿 使用模式：一般玩家點擊已註冊的水龍頭
        // ==========================================
        if (existingIndex > -1 && !player.isSneaking) {

            if (typeId === "minecraft:tripwire_hook") {
                event.cancel = true;
            }

            if (now - lastTime < 300) return;
            interactCooldown.set(player.id, now);

            system.run(() => {
                const faucet = faucetCache[existingIndex];
                faucet.isOn = !faucet.isOn;
                saveFaucets();

                if (faucet.isOn) {
                    player.onScreenDisplay.setActionBar("§a💦 Water Valve: OPEN (ON)§r");
                    player.playSound("bucket.empty_water", { location: block.location, pitch: 1.0, volume: 0.8 });
                } else {
                    player.onScreenDisplay.setActionBar("§c❌ Water Valve: CLOSED (OFF)§r");
                    player.playSound("bucket.fill_water", { location: block.location, pitch: 1.2, volume: 0.8 });
                }
            });
        }
    });

    // ==========================================
    // 🚿 視覺效果核心引擎：製造真實灑水效果
    // ==========================================
    system.runInterval(() => {
        if (faucetCache.length === 0) {
            try { faucetCache = JSON.parse(world.getDynamicProperty("custom_faucets") || "[]"); } catch (e) { }
        }

        if (faucetCache.length === 0) return;

        for (let i = faucetCache.length - 1; i >= 0; i--) {
            const faucet = faucetCache[i];
            if (!faucet.isOn) continue;

            try {
                const dim = world.getDimension(faucet.dim);
                const block = dim.getBlock({ x: faucet.x, y: faucet.y, z: faucet.z });

                if (!block || (block.typeId !== "minecraft:lever" && block.typeId !== "minecraft:tripwire_hook")) {
                    faucetCache.splice(i, 1);
                    saveFaucets();
                    continue;
                }

                const px = faucet.x + 0.5;
                const py = faucet.y + 0.1;
                const pz = faucet.z + 0.5;

                // 🌟 核心修改：使用你測試成功的唯一解 `water_drip_particle`
                // 為了打破單調感，每一 Tick 強制噴灑 4 顆，並且給予隨機偏移量！
                for (let j = 0; j < 4; j++) {
                    // 產生 -0.25 到 +0.25 的隨機偏移，模擬蓮蓬頭的散水半徑
                    const offsetX = (Math.random() - 0.5) * 0.5;
                    const offsetZ = (Math.random() - 0.5) * 0.5;

                    try {
                        dim.spawnParticle("minecraft:water_drip_particle", { x: px + offsetX, y: py, z: pz + offsetZ });
                    } catch (e) { }
                }

                // 播放流水白噪音
                if (system.currentTick % 20 === 0) {
                    dim.playSound("weather.rain", { x: px, y: py, z: pz }, { pitch: 1.5, volume: 0.1 });
                }
            } catch (e) { }
        }
    }, 1);
}