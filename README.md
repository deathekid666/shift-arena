# SHIFT Arena — Build 007

Browser-first third-person shooter prototype.

## Build 007 — compact cockroach combat loadout
- Two firearm slots only.
- Slot 1 and Slot 2 can each hold any current firearm.
- Seven world weapon pickups are available in the kitchen test area.
- E swaps the currently selected gun with the world gun.
- The dropped gun stays in the world and preserves its magazine ammo.
- Finite reserve ammunition replaces infinite ammo.
- Ammo types: Light (SMGs), Medium (ARs), Shells (shotguns), Heavy (sniper).
- Ammo boxes auto-pickup and respawn for testing.
- Dedicated Shell Armor slot on key 3.
- Shell Armor has two charges, takes 1.6 seconds to apply, restores 50 armor, and blocks firing while applying.
- Armor pickups can restore a charge.
- Dedicated Tin Fang hotbar slot is reserved on V; full melee/throw/retrieval behavior is Build 008.
- Combat Bot ON/OFF remains available with B and on the start screen.
- Weapon-specific reticles, recoil, scope, movement accuracy, sway, bob and audio from Build 006.1 are preserved.

## Controls
- 1 / 2: firearm slots
- E: swap nearby weapon
- 3: apply Shell Armor
- V: Tin Fang slot (full behavior in Build 008)
- B: bot on/off
- R: reload
- LMB: fire
- RMB: ADS / sniper scope
- WASD: move
- Shift: sprint
- Ctrl: crouch / slide
- Space: jump


## Build 007.1 HUD/control correction
- The main hotbar now shows exactly two firearm cards.
- Weapon cards keep the bright, stylized Fortnite-inspired card treatment.
- Armor is no longer an inventory card.
- Armor is displayed as two separate plate segments above the health bar, inspired by Battlefield REDSEC's two-plate HUD model.
- Each armor segment represents 50 armor.
- Key 3 applies a reserve Shell Armor plate.
- Tin Fang is a small status/control hint, not a third weapon card.
- Mouse wheel switches between the two firearm slots.
- Keys 1 and 2 still switch directly.
- Mouse wheel input is debounced to prevent high-resolution wheels from toggling back and forth on one gesture.


## Build 008 — Tin Fang
- Tap V for a fast animated Tin Fang melee slash (40 damage).
- Hold V past 0.28 seconds to enter the throw wind-up; release V to throw.
- Throw speed rises with charge from 21 to 29 world units/s.
- Projectile has real travel time and gravity rather than hitscan.
- Thrown body hit deals 90 damage.
- Thrown headshot uses an explicit instant-elimination rule.
- The Fang sticks into targets, walls, floors, ramps and other world geometry.
- Recover it by moving within 0.85 world units of the stuck Fang.
- A HUD marker shows direction and distance to a stuck Fang.
- If the Fang leaves the arena or times out, it is LOST until respawn.
- While Fang is thrown/stuck/lost, V performs a weaker 22-damage claw attack.
- Death/respawn returns the Fang.
- Procedural animation includes draw, wind-up, charge pose, slash arc, throw snap, spinning flight/trail, stuck pulse and recovery.
- Guns are visually holstered and firing/switching is blocked during melee/throw wind-up.


## Build 008.1 — Fang input/recovery fixes
- Hold behavior now checks the physical V key state every frame.
- Quick tap V always resolves to melee as soon as V is no longer held.
- Holding V past the prime threshold enters charge; releasing V throws immediately.
- Fang recovery now uses horizontal proximity plus vertical tolerance instead of strict 3D distance.
- Recovery radius increased to 1.15 with 1.65 vertical tolerance so stuck Fang pickups work on floors, walls and target bodies.


## Build 008.2 — Tin Fang aim/physics polish
- Hold V now enters a dedicated over-the-shoulder Fang aim pose with a visible throwing arm.
- Camera tightens to a dedicated Fang aiming FOV/distance/shoulder position.
- Camera-center ray determines the intended target point first.
- The actual launch velocity is solved ballistically from the character's hand to that crosshair target.
- The trajectory preview uses the same gravity/speed solution as the real projectile.
- Release has a staged animation: coil, torso/arm drive, exact launch frame, then follow-through.
- Fang sticks to moving target hit meshes and follows them while they remain alive.
- If an embedded target dies, the Fang detaches and falls instead of disappearing.
- Embedded or settled Fang has its own shootable hitbox.
- Shooting the Fang knocks it loose.
- Knocked-loose Fang spins under gravity, collides with the kitchen, bounces, settles, then becomes recoverable.
- HUD has states for AIMING, RELEASE, FALLING and DROPPED.
- Fang lifecycle reset on elimination/respawn was corrected.


## Build 008.3 — low-ceiling aim + floor settling
- Tin Fang now detects low overhead clearance while aiming.
- Under tables/counters it switches automatically to a compact side-throw animation instead of clipping the arm/Fang through furniture.
- Compact throw keeps the same crosshair/ballistic targeting.
- Fang camera shoulder offset tightens slightly in low-clearance aim mode.
- HUD shows FANG AIM · LOW when the compact pose is active.
- Settled Fang now uses the actual collision surface point plus the model's world bounding box.
- After bounce/fall animation, the blade is lifted until its lowest geometry sits above the floor, preventing visual sinking.


## Build 008.4 — cramped camera + visible Fang floor fit
- Fang aim camera no longer only collapses straight toward the player when furniture blocks it.
- In cramped aim situations the camera searches alternate left/right shoulder positions and shorter clean distances.
- Compact under-table aiming keeps fallback camera movement mostly horizontal to avoid the tabletop underside.
- If no useful third-person camera position exists, only the placeholder player body/visor hides; the Fang arm/knife animation remains visible.
- This prevents the giant yellow player body from covering the crosshair when camera collision gets tight.
- Settled Fang floor fitting now ignores the invisible shootable hitbox and calculates bounds from visible blade/handle geometry only.
- This prevents the visible knife from hovering or sinking because of the larger invisible hit sphere.


## Build 009 — Phase 1: Character 01 / Roach Scout
- Replaced the visible yellow capsule with the first stylized humanoid cockroach character.
- Character direction follows the approved first sketch: cute anime/cartoon proportions, human-like silhouette, warm brown/orange chitin, cream outfit, oversized expressive eyes, hair/crest, long antennae and no wings.
- Character is constructed as articulated body parts rather than decorating the old capsule.
- Added head, face, anime eyes/highlights, smile, crest/hair, antennae, torso, chest panel, belt, hips, shell-back plates, arms, hands, legs and boots.
- Added explicit weapon, Fang and head sockets for later rigging/character variants.
- Existing movement collision values remain unchanged so Build 009 is visual-first.
- Basic articulated combat pose wraps the character's arms around the current firearm position.
- Gun presentation was centered slightly to fit the new character's hands.
- The dedicated Tin Fang throw arm now uses the character palette and temporarily replaces the right character arm during Fang animations.
- Camera body hiding hides only the character mesh; gun/Fang visuals remain available in cramped spaces.
- Full locomotion/scuttle/idle animation remains Build 010.


## Build 009.1 — real VRM character pipeline
- Replaced the procedural Three.js character as the normal rendering path.
- Added an import map for one shared Three.js module plus GLTFLoader and @pixiv/three-vrm.
- Added src/vrm-character.js, which loads a real skinned VRM avatar through GLTFLoader + VRMLoaderPlugin.
- The temporary development avatar is sample2.vrm from norio/vrm-game-starter, pinned to commit b14c236fd8150855348ad085b7820c298eac4b30.
- That upstream project is MIT for source and explicitly documents its bundled VRoid sample avatars as redistributed under their own VRM metadata terms. This avatar is a development rig base only, not the final SHIFT character artwork.
- Avatar auto-fits to SHIFT's existing 1.8-unit gameplay capsule without altering movement/collision.
- Exposes real humanoid head, chest, arm, hand, hip and leg bones.
- Added Roach Scout antennae and shell accessories parented to real head/chest bones.
- Added normalized weapon, Fang and head sockets for later exact weapon attachment.
- Added a lightweight bone pose so the avatar does not remain in a raw T-pose while animation retargeting is still pending.
- Fang can hide the actual VRM right arm while the dedicated throw arm is active.
- The old Build 009 primitive mesh remains fallback-only if VRM loading fails.
- Final target remains a custom Roach Scout VRM/GLB matching the approved sketch; replacing the temporary base will require only swapping the asset URL/model, not rewriting movement/combat.
- Open-source character-loader/VRM architecture references: pixiv/three-vrm (MIT), norio/vrm-game-starter (MIT), M3-org/CharacterStudio (MIT).


## Build 009.2 — aim camera + real hands
- VRM loading is now dynamically imported so a slow three-vrm CDN/model request cannot block SHIFT's initial render with a blank white page.
- VRM loading has a 12-second timeout and falls back cleanly instead of hanging startup.
- Smart obstacle-aware shoulder camera collision now applies to normal firearm ADS as well as Tin Fang aiming.
- Character visuals hide earlier when geometry compresses the aim camera, preventing the camera from entering VRM face/clothing meshes and filling the screen white.
- Collision camera minimum resolved distance increased from 0.72 to 0.96.
- Firearms now follow the actual VRM right-hand world position instead of remaining at the old capsule-root coordinates.
- Weapon pitch follows camera aim while the character faces the camera yaw; muzzle/crosshair trace logic remains camera-first.
- Character combat pose is no longer permanently active just because a firearm is visible.
- Tin Fang no longer spawns a second procedural arm when the VRM is loaded.
- The Fang model is reparented to the actual VRM right-hand Fang socket.
- Hold/release/slash animate the real VRM shoulder, forearm, hand and upper chest.
- The improvised Tin Fang mesh was rebuilt with a tapered asymmetric metal shard, sharpened edge, spine, six cord wraps, guard and ring pommel.


## Build 009.3 — context-aware combat reticle
- Reticle is now state-driven instead of reusing the firearm crosshair for every action.
- Normal state always uses the active firearm's own weapon-driven reticle and spread gap.
- PRIMING switches to a restrained Fang draw mark without promising throw accuracy before the throw is actually aimed.
- AIMING replaces the gun crosshair with a knife-shaped center mark plus circular charge progress.
- Fang charge ring is driven by the exact Tin Fang charge ratio.
- Full charge gets a steady bright lock cue rather than a distracting continuous pulse.
- RELEASE contracts the Fang reticle at the throw moment.
- As soon as the Fang leaves the hand, THROWN/STUCK/FALLING/DROPPED states return immediately to the equipped firearm reticle.
- Quick Tin Fang melee and missing-Fang claw attacks use a short dual-slash melee indicator.
- Existing ballistic trajectory remains the spatial landing predictor, using the same projectile solution as the actual throw.
- Design references: weapon-driven reticles/accuracy feedback in Fortnite and held-throw trajectory guidance in Apex-style throwable systems.
