import { world, system } from '@minecraft/server';

export function registerKnockbackSystem() {
    world.afterEvents.entityHurt.subscribe((event) => {
        const victim = event.hurtEntity;
        const damageSource = event.damageSource;
        const attacker = damageSource.damagingEntity;

        system.run(() => {
            // try {
                if (!victim || !victim.isValid) return;
                if (!attacker || !attacker.isValid) return;

                const hitloc = attacker.location;
                const beinghitloc = victim.location;
                world.sendMessage(`§a[Knockback] Victim: ${victim.nameTag || 'Unknown'} | Attacker: ${attacker.nameTag || 'Unknown'}§r`);
                const direction = {
                    x: beinghitloc.x - hitloc.x,
                    y: beinghitloc.y - hitloc.y,
                    z: beinghitloc.z - hitloc.z
                }
                const magnitude = Math.sqrt(direction.x * direction.x + direction.z * direction.z)
                const newdir = {
                    x: direction.x / magnitude,
                    z: direction.z / magnitude
                }
                // attacker.addEffect("weakness", 9, { amplifier: 255, showParticles: false });
                if (victim.typeId !== "minecraft:player") {
                    victim.clearVelocity();
                    victim.applyImpulse({ x: newdir.x / 4.25, y: 0.33, z: newdir.z / 4.25 });
                }
            // } catch (e) {
            //     world.sendMessage(`§c[Knockback Error] ${e.name}: ${e.message}§r`);
            // }
        })
    });
}