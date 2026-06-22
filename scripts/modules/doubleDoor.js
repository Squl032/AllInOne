import { world, system } from "@minecraft/server";

export function registerDoubleDoorSystem() {
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const block = event.block;
        const player = event.player;

        if (player.isSneaking) return;

        // 確保點擊的是門（排除活板門）
        if (!block.typeId.includes("door") || block.typeId.includes("trapdoor")) return;

        let perm = block.permutation;
        let isOpen;
        let direction;
        try {
            isOpen = perm.getState("open_bit");
            direction = perm.getState("direction");
            if (isOpen === undefined || direction === undefined) return;
        } catch (e) { return; }

        // 🌟 攔截預設動作，接管所有門的控制權（賦予鐵門手動點擊的能力！）
        event.cancel = true;

        system.run(() => {
            let newOpenState = !isOpen;

            // 往東、西、南、北尋找相鄰的另一半門
            const offsets = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
            let adjacentDoor = null;

            for (const off of offsets) {
                try {
                    const checkBlock = player.dimension.getBlock({ x: block.location.x + off.x, y: block.location.y, z: block.location.z + off.z });
                    if (checkBlock && checkBlock.typeId === block.typeId) {
                        // 只要方向 (direction) 一致，就是同一組雙開門
                        if (checkBlock.permutation.getState("direction") === direction) {
                            adjacentDoor = checkBlock;
                            break;
                        }
                    }
                } catch (e) { }
            }

            // 更新門的狀態 (包含門的上半部與下半部)
            const updateDoor = (targetBlock, state) => {
                try {
                    let p = targetBlock.permutation;
                    let isUpper = p.getState("upper_block_bit");

                    targetBlock.setPermutation(p.withState("open_bit", state));

                    const otherHalfLoc = { x: targetBlock.location.x, y: targetBlock.location.y + (isUpper ? -1 : 1), z: targetBlock.location.z };
                    const otherHalf = targetBlock.dimension.getBlock(otherHalfLoc);
                    if (otherHalf && otherHalf.typeId === targetBlock.typeId) {
                        otherHalf.setPermutation(otherHalf.permutation.withState("open_bit", state));
                    }
                } catch (e) { }
            };

            // 同步打開/關閉自己與旁邊的門
            updateDoor(block, newOpenState);
            if (adjacentDoor) {
                updateDoor(adjacentDoor, newOpenState);
            }

            // 播放對應材質的開關門音效
            const isIron = block.typeId.includes("iron");
            const sound = newOpenState
                ? (isIron ? "open.iron_door" : "open.wooden_door")
                : (isIron ? "close.iron_door" : "close.wooden_door");

            player.playSound(sound, { location: block.location });
        });
    });
}