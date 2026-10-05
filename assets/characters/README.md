# Roach Scout character preview

This preview branch loads `roach-scout.glb` directly. The Mixamo skeleton is adapted to the existing normalized humanoid animation controller; gameplay physics and the Build010.28I weapon animation layers remain in place. This is a test asset, not a production-ready character.

## Asset attribution
Ember Antenna Scout, created by nlaassali1 with Meshy from the user-approved Scout reference. Generated under CC BY4.0: https://creativecommons.org/licenses/by/4.0/ . Service: https://www.meshy.ai/ . Original rigged export retained unchanged in this GLB; runtime changes normalize skin influences and establish the humanoid rest pose. The file includes Running and Walking; gameplay uses the existing animation library and pose layers.

## Validation and remaining work
Local browser smoke test: load, authored locomotion ready, sprint jump and landing; no runtime errors. Existing five jump-motion tests pass. Preview still needs full weapon-grip, crouch/slide, knife, bot and low-end-device playtesting. Source mesh has165,814 triangles and a16MB payload; optimization is pending. Do not promote automatically.
