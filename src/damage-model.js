export function resolveShieldedDamage({
  health,
  shield,
  amount
}) {
  const requestedDamage = Math.max(0, Number(amount) || 0);
  const healthBefore = Math.max(0, Number(health) || 0);
  const shieldBefore = Math.max(0, Number(shield) || 0);

  let remaining = requestedDamage;

  const shieldDamage = Math.min(shieldBefore, remaining);
  const nextShield = Math.max(0, shieldBefore - shieldDamage);
  remaining -= shieldDamage;

  const healthDamage = Math.min(healthBefore, remaining);
  const nextHealth = Math.max(0, healthBefore - healthDamage);

  return {
    requestedDamage,
    damage: shieldDamage + healthDamage,
    shieldDamage,
    healthDamage,
    shieldBefore,
    healthBefore,
    shield: nextShield,
    health: nextHealth,
    shieldBroken: shieldBefore > 0 && nextShield <= 0,
    startedOnShield: shieldBefore > 0,
    eliminated: nextHealth <= 0
  };
}
