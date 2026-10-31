/** Presentation lifetimes only. These never schedule damage, procs, targeting or reload. */
export const MISSILE_VFX = {
  arcLife: 0.34,
  relayReveal: 0.025,
  ionImpactLife: 0.3,
  resonanceLife: 0.46,
  chargePulseLife: 0.16,
} as const;
