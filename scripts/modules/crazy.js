import { world, system, EquipmentSlot } from "@minecraft/server";

export function registerCrazySystem() {
    const edibleKeywords = ["eat", "heart", "brain", "liver", "kidney", "lung", "stomach", "eye", "flesh"];
    const crazyCooldown = new Map();

    // 判斷是否為「自訂可用物品」的輔助函數
    const isCrazyItem = (item) => {
        if (!item) return false;
        if (item.typeId.includes("lightning_rod")) return true;
        if (item.nameTag) {
            const lowerName = item.nameTag.toLowerCase();
            const hasKeyword = edibleKeywords.some(keyword => lowerName.includes(keyword));
            // 雙重保險：用 getComponent 確保相容性
            const isVanillaFood = !!(item.getComponent("minecraft:food") || item.getComponent("food"));
            return hasKeyword && !isVanillaFood;
        }
        return false;
    };

    // 執行狂暴效果的獨立函數
    const executeCrazyAction = (player, activeSlot, activeItem) => {
        const now = Date.now();
        if (crazyCooldown.has(player.id) && now - crazyCooldown.get(player.id) < 200) return;
        crazyCooldown.set(player.id, now);

        // ==========================================
        // A. Lightning Rod Smite
        // ==========================================
        if (activeItem.typeId.includes("lightning_rod")) {
            const blockHit = player.getBlockFromViewDirection({ maxDistance: 40 });
            const entityHit = player.getEntitiesFromViewDirection({ maxDistance: 40 })[0];

            let targetLoc = null;
            if (entityHit) targetLoc = entityHit.entity.location;
            else if (blockHit) targetLoc = blockHit.block.location;

            if (targetLoc) {
                player.dimension.spawnEntity("minecraft:lightning_bolt", targetLoc);
                player.onScreenDisplay.setActionBar("§eSMITE!§r");
            } else {
                player.onScreenDisplay.setActionBar("§cTarget too far...§r");
            }
            return;
        }

        // ==========================================
        // B. Eat Questionable Items
        // ==========================================
        if (activeItem.amount > 1) {
            activeItem.amount -= 1;
            activeSlot.setItem(activeItem);
        } else {
            activeSlot.setItem(undefined);
        }

        player.playSound("random.eat", { pitch: 1.0, volume: 1.0 });
        system.runTimeout(() => {
            // 🌟 確保玩家吃完東西後還在線上，避免報錯
            if (player.isValid) {
                player.playSound("random.burp", { pitch: 1.0, volume: 1.0 });
            }
        }, 10);

        player.addEffect("nausea", 160, { amplifier: 0, showParticles: true });
        player.addEffect("regeneration", 400, { amplifier: 1, showParticles: true });
        player.onScreenDisplay.setActionBar("§2Consumed questionable organic matter.§r");
    };

    // --- 1. 對空氣按右鍵 (嚴格驗證觸發來源) ---
    world.afterEvents.itemUse.subscribe((event) => {
        const player = event.source;
        const usedItem = event.itemStack;

        if (!isCrazyItem(usedItem)) return;

        const equippable = player.getComponent("equippable");
        const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
        const offSlot = equippable.getEquipmentSlot(EquipmentSlot.Offhand);

        let activeSlot = null;
        if (mainSlot.getItem()?.typeId === usedItem.typeId) activeSlot = mainSlot;
        else if (offSlot.getItem()?.typeId === usedItem.typeId) activeSlot = offSlot;

        if (activeSlot) executeCrazyAction(player, activeSlot, usedItem);
    });

    // --- 2. 對方塊或實體按右鍵 (依序檢查主副手) ---
    const processInteract = (player) => {
        const equippable = player.getComponent("equippable");
        if (!equippable) return;

        const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
        const offSlot = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
        const mainItem = mainSlot.getItem();
        const offItem = offSlot.getItem();

        let activeSlot = null;
        let activeItem = null;

        if (isCrazyItem(mainItem)) {
            activeSlot = mainSlot;
            activeItem = mainItem;
        } else if (isCrazyItem(offItem)) {
            if (mainItem && (mainItem.typeId.includes("hoe") || mainItem.typeId.includes("bucket") || mainItem.typeId.includes("bowl"))) return;

            activeSlot = offSlot;
            activeItem = offItem;
        }

        if (activeItem) executeCrazyAction(player, activeSlot, activeItem);
    };

    if (world.afterEvents.playerInteractWithBlock) {
        world.afterEvents.playerInteractWithBlock.subscribe((event) => processInteract(event.player));
    }
    if (world.afterEvents.playerInteractWithEntity) {
        world.afterEvents.playerInteractWithEntity.subscribe((event) => processInteract(event.player));
    }

    // ==========================================
    // Bedwars KB Stick (木棍擊退機制保留不變)
    // ==========================================
    world.afterEvents.entityHurt.subscribe((event) => {
        const victim = event.hurtEntity;
        const damageSource = event.damageSource;
        const attacker = damageSource.damagingEntity;

        if (attacker && attacker.typeId === "minecraft:player") {
            const equippable = attacker.getComponent("equippable");
            if (!equippable) return;

            const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
            const item = mainSlot.getItem();

            if (item && item.typeId === "minecraft:stick") {
                system.run(() => {
                    // 🌟 核心修正：跟 combat.js 一樣的實體存活防呆機制！
                    if (!victim || !victim.isValid) return;
                    if (!attacker || !attacker.isValid) return;

                    let dx = victim.location.x - attacker.location.x;
                    let dz = victim.location.z - attacker.location.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);

                    if (distance > 0) {
                        victim.clearVelocity();
                        victim.applyImpulse({
                            x: (dx / distance) * 2.2,
                            y: Math.PI / 10,
                            z: (dz / distance) * 2.2
                        });
                        attacker.playSound("random.anvil_land", { pitch: 2.0, volume: 0.5 });
                    }
                });
            }
        }
    });
}