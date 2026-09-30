import { world } from '@minecraft/server';

world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
    if (!hurtEntity || !hurtEntity.isValid) return;
    if (!damageSource && !damageSource.isValid) return;

    const hitloc = damageSource.damagingEntity.location
    const beinghitloc = hurtEntity.location
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
    damageSource.damagingEntity.addEffect("weakness", 9, { amplifier: 255, showParticles: false });
    if (hurtEntity.typeId !== "minecraft:player") {
        hurtEntity.clearVelocity()
        hurtEntity.applyImpulse({ x: newdir.x / 4.25, y: 0.33, z: newdir.z / 4.25 });
    }
}
);