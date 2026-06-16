import { world, EquipmentSlot } from "@minecraft/server";

// 用戶最新的截圖特定物品顏色映射表是用戶提供的 image_8.png
const itemColors = {
    "minecraft:gold_ingot": "§6", // Gold Color
    "minecraft:diamond": "§b",      // Aqua Color
    "minecraft:emerald": "§a",      // Green Color
    "minecraft:iron_ingot": "§f",   // White Color
    "minecraft:netherite_ingot": "§8", // Dark Gray
    "minecraft:quartz": "§f",       // White Color
    "minecraft:prismarine_crystals": "§b", // Aqua Color
    "minecraft:blaze_powder": "§e",  // Yellow Color
};

// 輔助函數：將物品 ID 轉換成漂亮的大小寫 CamelCase 名稱，並添加特定的顏色
function formatColoredItemName(typeId, nameTag) {
    if (nameTag) return nameTag;

    const parts = typeId.replace("minecraft:", "").split("_");
    const camelCased = parts.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");

    const color = itemColors[typeId] || "§f";
    return color + camelCased;
}

// 輔助函數：將容器方塊 ID 轉換成漂亮的大小寫 CamelCase 名稱，並添加特定的顏色
function formatColoredContainerName(typeId, nameTag) {
    if (nameTag) return nameTag;

    const parts = typeId.replace("minecraft:", "").split("_");
    const camelCased = parts.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");

    const colors = {
        "minecraft:ender_chest": "§5",
        "minecraft:shulker_box": "§d",
    };

    const color = colors[typeId] || "§5";
    return color + camelCased;
}

export function registerQuickStoreSystem() {
    world.afterEvents.entityHitBlock.subscribe((event) => {
        const player = event.damagingEntity;

        // 🌟 核心防護 1：加上 isValid 防止實體消失報錯
        if (!player || player.typeId !== "minecraft:player" || !player.isValid) return;

        const block = event.hitBlock;
        if (!block) return;

        const inventoryComp = block.getComponent("inventory");

        // 如果這個方塊沒有物品欄 (不是箱子/木桶/界浮盒等)，就直接忽略
        if (!inventoryComp) return;

        const equippable = player.getComponent("equippable");
        if (!equippable) return;

        const mainSlot = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
        const heldItem = mainSlot.getItem();

        // 玩家必須手上拿著東西才能存
        if (!heldItem) return;

        const container = inventoryComp.container;
        const originalAmount = heldItem.amount;

        const formattedColoredItemName = formatColoredItemName(heldItem.typeId, heldItem.nameTag);
        const formattedColoredContainerName = formatColoredContainerName(block.typeId);

        // 🌟 核心防護 2：徹底拔除 system.run()！
        // 在 afterEvents 裡直接同步執行，讓存入與扣除在同一個 Tick 完成，100% 杜絕刷物品 Bug！
        const leftover = container.addItem(heldItem);
        const leftoverAmount = leftover ? leftover.amount : 0;
        const depositedAmount = originalAmount - leftoverAmount;

        if (depositedAmount > 0) {
            // 有成功存入物品！同步更新玩家手上的剩餘物品
            if (leftover) {
                mainSlot.setItem(leftover);
            } else {
                mainSlot.setItem(undefined);
            }

            // 結算箱子裡面「這項物品」的總數量
            let totalInChest = 0;
            for (let i = 0; i < container.size; i++) {
                const slotItem = container.getItem(i);
                if (slotItem && slotItem.typeId === heldItem.typeId && slotItem.nameTag === heldItem.nameTag) {
                    totalInChest += slotItem.amount;
                }
            }

            player.playSound("random.pop", { pitch: 1.5, volume: 0.8 });
            player.sendMessage(`§7Deposited x${depositedAmount} ${formattedColoredItemName} §7into ${formattedColoredContainerName}§7! (${totalInChest} Total)§r`);

        } else {
            // 存入數量為 0，代表箱子滿了
            player.playSound("note.bass", { pitch: 0.8, volume: 1.0 });
            player.onScreenDisplay.setActionBar("§cContainer is full!§r");
        }
    });
}