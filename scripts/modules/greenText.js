import { world } from "@minecraft/server";

export function registerGreenText() {
    world.beforeEvents.chatSend.subscribe((event) => {
        if (event.message.startsWith(">")) {
            event.cancel = true;
            world.sendMessage(`<${event.sender.name}> §a${event.message}§r`);
        }
    });
}