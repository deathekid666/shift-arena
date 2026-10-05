// One authoritative ownership predicate for authored slide animation.
//
// Both the character upper-body layer and the weapon attachment must agree on
// this window. If one returns to normal carry before the other, the arm and
// weapon fight during Slide_Exit and produce a small sideways hand pop.
const SLIDE_STATES =
  new Set([
    'SLIDE_START',
    'SLIDE_LOOP',
    'SLIDE_EXIT'
  ]);

export function isAuthoredSlideOwnershipActive(
  playerSliding,
  authoredLocomotion
) {
  if (playerSliding) return true;
  if (!authoredLocomotion) return false;

  return Boolean(
    authoredLocomotion.slideExitActive ||
    (
      authoredLocomotion.slideExitTail ??
      0
    ) > 0.015 ||
    SLIDE_STATES.has(
      authoredLocomotion.state
    )
  );
}
