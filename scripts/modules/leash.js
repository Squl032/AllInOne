import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";

// 紀錄被牽著的玩家與其「替身隱形雞」的對應關係
const leashedPlayers = new Map();

export function registerLeashSystem() {

    // ==========================================
    // 🌟 幽靈大掃除：每次 Reload 自動清理上次殘留的隱形雞
    // ==========================================
    system.run(() => {
        for (const dimName of ["overworld", "nether", "the_end"]) {
            try {
                const dim = world.getDimension(dimName);
                const ghostChickens = dim.getEntities({ tags: ["dummy_leash"] });
                for (const ghost of ghostChickens) ghost.remove();
            } catch (e) { }
        }
    });

    // ==========================================
    // 🌟 右鍵點擊玩家：上牽繩 / 解開牽繩
    // ==========================================
    world.afterEvents.playerInteractWithEntity.subscribe((event) => {
        const player = event.player;
        const target = event.target;

        // 只針對玩家起作用
        if (target.typeId !== "minecraft:player") return;

        // 1. 如果對方已經被栓住了，再次點擊就會「解開」
        if (leashedPlayers.has(target.id)) {
            const data = leashedPlayers.get(target.id);
            try {
                if (data.dummy.isValid()) data.dummy.remove();
            } catch (e) { }
            leashedPlayers.delete(target.id);

            // 掉落栓繩並播放音效
            player.dimension.spawnItem(new ItemStack("minecraft:lead", 1), target.location);
            player.playSound("leashknot.break", { location: target.location });
            return;
        }

        // 2. 如果對方沒被栓住，檢查自己手上是不是拿著栓繩
        const equippable = player.getComponent("equippable");
        if (!equippable) return;
        const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
        const item = mainSlot.getItem();

        if (!item || item.typeId !== "minecraft:lead") return;

        // 扣除手上的栓繩 (生存模式)
        const isCreative = [...world.getPlayers({ gameMode: "creative" })].some(p => p.id === player.id);
        if (!isCreative) {
            if (item.amount > 1) {
                item.amount -= 1;
                mainSlot.setItem(item);
            } else {
                mainSlot.setItem(undefined);
            }
        }

        // 🌟 召喚「替身隱形雞」並綁上繩子
        system.run(() => {
            const dummy = player.dimension.spawnEntity("minecraft:chicken", target.location);
            dummy.addTag("dummy_leash"); // 防重啟殘留標籤

            // 給予終極隱形與無敵
            dummy.addEffect("invisibility", 999999, { amplifier: 255, showParticles: false });
            dummy.addEffect("resistance", 999999, { amplifier: 255, showParticles: false });
            dummy.addEffect("slowness", 999999, { amplifier: 255, showParticles: false });

            // 讓雞被玩家牽住
            const leashable = dummy.getComponent("leashable");
            if (leashable) {
                leashable.leash(player);
            }

            player.playSound("leashknot.place", { location: target.location });

            // 記錄這段孽緣
            leashedPlayers.set(target.id, { dummy: dummy, leasherId: player.id });
        });
    });

    // ==========================================
    // 🌟 每幀循環：更新視覺牽繩與「遛狗拉扯物理引擎」
    // ==========================================
    system.runInterval(() => {
        if (leashedPlayers.size === 0) return;

        const allPlayers = world.getAllPlayers();

        for (const [targetId, data] of leashedPlayers.entries()) {
            const target = allPlayers.find(p => p.id === targetId); // 被牽的狗
            const leasher = allPlayers.find(p => p.id === data.leasherId); // 主人
            const dummy = data.dummy;

            let shouldBreak = false;

            // 如果有人斷線，或是替身雞死掉了
            if (!target || !leasher || !dummy || !dummy.isValid()) {
                shouldBreak = true;
            } else {
                // 計算兩人的距離
                const dx = leasher.location.x - target.location.x;
                const dy = leasher.location.y - target.location.y;
                const dz = leasher.location.z - target.location.z;
                const distSq = dx * dx + dy * dy + dz * dz;

                // 超過 10 格，繩子強制斷裂
                if (distSq > 100) {
                    shouldBreak = true;
                } else {
                    // 🌟 視覺核心：把隱形雞死死黏在被牽的玩家身上
                    try {
                        dummy.teleport(target.location, { dimension: target.dimension });
                    } catch (e) { }

                    // 🌟 物理核心：每 4 Ticks 施加一次拉力 (讓畫面順滑不抽搐)
                    if (system.currentTick % 4 === 0) {
                        const dist = Math.sqrt(distSq);

                        // 超過 3 格就開始拖拽
                        if (dist > 3) {
                            const dirX = dx / dist;
                            const dirZ = dz / dist;

                            // 互動細節：如果被牽的人按下「蹲下 (Shift)」，拉力會變弱 (他在抵抗！)
                            const resistance = target.isSneaking ? 0.3 : 1.0;

                            // 距離越遠，拉力越強 (設定力道上限防止飛出宇宙)
                            const hForce = Math.min((dist - 3) * 0.15, 0.8) * resistance;
                            const vForce = target.isOnGround ? 0.15 : 0.05; // 稍微往上拉，防止卡階梯

                            target.applyKnockback(dirX, dirZ, hForce, vForce);
                        }
                    }
                }
            }

            // 處理斷繩邏輯
            if (shouldBreak) {
                try { if (dummy && dummy.isValid()) dummy.remove(); } catch (e) { }
                leashedPlayers.delete(targetId);

                if (target) {
                    target.dimension.spawnItem(new ItemStack("minecraft:lead", 1), target.location);
                    target.playSound("leashknot.break", { location: target.location });
                }
            }
        }
    }, 1);
}