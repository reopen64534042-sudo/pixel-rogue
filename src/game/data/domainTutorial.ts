/** Domain lessons share movement/dash controls, then teach the actual weapon loop. */
export const DOMAIN_TUTORIAL_STEPS = {
  field: 2,
  collapse: 3,
  slash: 4,
  void: 5,
  growth: 6,
  gems: 7,
} as const;

/** Per-lesson observations; crowds cannot complete repeated-hit lessons in one frame. */
export function createDomainTutorialProgress() {
  return {
    fieldTicks: 0,
    lastFieldHitAt: -Infinity,
    collapseHit: false,
    slashTicks: 0,
    lastSlashHitAt: -Infinity,
    overloadTime: 0,
    statsOpened: false,
  };
}
