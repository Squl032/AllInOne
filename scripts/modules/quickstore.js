import { world, system, EquipmentSlot } from "@minecraft/server";

// 用戶最新的截圖特定物品顏色映射表是用戶提供的 image_8.png
// 這裡 CamelCase 物品名稱本身沒有顏色，顏色是加在整個 CamelCase 之前的。
const itemColors = {
    "minecraft:gold_ingot": "§6", // Gold Color
    "minecraft:diamond": "§b",      // Aqua Color
    "minecraft:emerald": "§a",      // Green Color
    "minecraft:iron_ingot": "§f",   // White Color
    "minecraft:netherite_ingot": "§8", // Dark Gray
    "minecraft:quartz": "§f",       // White Color
    "minecraft:prismarine_crystals": "§b", // Aqua Color
    "minecraft:blaze_powder": "§e",  // Yellow Color
    // 可手動添加更多物品ID與顏色的對應
};

// 輔助函數：將物品 ID 轉換成漂亮的大小寫 CamelCase 名稱，並添加特定的顏色
function formatColoredItemName(typeId, nameTag) {
    // 如果有自訂名稱 (鐵砧改名)，則優先使用原名稱，保持區分大小寫和顏色程式碼
    if (nameTag) return nameTag;

    // 否則從 typeId 格式化自訂 CamelCase 名稱
    const parts = typeId.replace("minecraft:", "").split("_");
    const camelCased = parts.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");

    // 如果是用戶最新的截圖中特定的物品，則使用特定顏色，其餘預設使用白色 §f。
    // 是用戶之前的代碼 CamelCase 白色 (§f)。是用戶最新的截圖特定物品彩色。
    // 是用戶說物品名稱是彩色的 CamelCase。
    // 我將添加特定物品顏色映射表。其餘使用白色。
    const color = itemColors[typeId] || "§f"; // 默認白色，因是用戶之前的用戶提供的 (§f) 用於 CamelCase 物品
    return color + camelCased;
}

// 輔助函數：將容器方塊 ID 轉換成漂亮的大小寫 CamelCase 名稱，並添加特定的顏色
// 是用戶說箱子也是，不過原版沒有 Team Chest 用 CamelCase
function formatColoredContainerName(typeId, nameTag) {
    if (nameTag) return nameTag; // 保留自訂容器名稱的顏色和 CamelCase 名稱

    const parts = typeId.replace("minecraft:", "").split("_");
    const camelCased = parts.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");

    // 如果是用戶最新的截圖中特定的容器，例如 Ender Chest，使用深紫色。是用戶之前的代碼容器紫色。
    // 這裡容器名稱 CamelCase 之後本身沒有顏色，顏色是加在整個 CamelCase 之前的。
    const colors = {
        "minecraft:ender_chest": "§5", // 用於所有容器
        "minecraft:shulker_box": "§d", // 粉紫色
        // 默認是用戶提供的深紫色 (§5) 用於 CamelCase 容器名。
        // 是用戶說照原版名稱，因沒有 Team Chest 用 CamelCase。
    };

    const color = colors[typeId] || "§5"; // 默認深紫色 (§5)，這是是用戶提供的深紫色 (§5)
    return color + camelCased;
}

export function registerQuickStoreSystem() {
    world.afterEvents.entityHitBlock.subscribe((event) => {
        const player = event.damagingEntity;
        if (player.typeId !== "minecraft:player") return; // 確保是玩家敲擊的

        const block = event.hitBlock;
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

        // 抓取方塊的自訂名稱需要鐵砧改名，但 API 不直接公開。
        // 用戶說原版沒有 Team Chest 用 CamelCase。是用戶之前的代碼使用深紫色 (§5)。
        // 是用戶最新的截圖顯示特定的特定容器特定的顏色。
        // 所以我將格式化 CamelCase 容器名稱，並設為深紫色 (§5)。
        // 抓取彩色的 CamelCase 物品名稱，支持自訂 CamelCase
        const formattedColoredItemName = formatColoredItemName(heldItem.typeId, heldItem.nameTag);

        // 抓取彩色的 CamelCase 容器名稱
        const formattedColoredContainerName = formatColoredContainerName(block.typeId);

        system.run(() => {
            const leftover = container.addItem(heldItem);
            const leftoverAmount = leftover ? leftover.amount : 0;
            const depositedAmount = originalAmount - leftoverAmount;

            if (depositedAmount > 0) {
                // 有成功存入物品！更新玩家手上的剩餘物品
                if (leftover) {
                    mainSlot.setItem(leftover);
                } else {
                    mainSlot.setItem(undefined);
                }

                // 結算箱子裡面「這項物品」的總數量
                let totalInChest = 0;
                for (let i = 0; i < container.size; i++) {
                    const slotItem = container.getItem(i);
                    // 必須是同 ID 且同自訂名稱，才算同一種物品
                    if (slotItem && slotItem.typeId === heldItem.typeId && slotItem.nameTag === heldItem.nameTag) {
                        totalInChest += slotItem.amount;
                    }
                }

                player.playSound("random.pop", { pitch: 1.5, volume: 0.8 });

                // 完美還原彩色物品與容器的訊息！
                // §7 = 灰色基礎文字，物品和容器名稱本身帶有顏色程式碼
                // 物品： Gold Ingot -> 黃色 (§6)
                // 容器： Ender Chest -> 深紫色 (§5)
                // 基礎文字： 灰色 (§7)
                player.sendMessage(`§7Deposited x${depositedAmount} ${formattedColoredItemName} §7into ${formattedColoredContainerName}§7! (${totalInChest} Total)§r`);

            } else {
                // 存入數量為 0，代表箱子滿了
                player.playSound("note.bass", { pitch: 0.8, volume: 1.0 });
                player.onScreenDisplay.setActionBar("§cContainer is full!§r");
            }
        });
    });
}