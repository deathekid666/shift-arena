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


## Build 009.4 — Roach Scout V1 costume/silhouette pass
- Kept the proven real VRM humanoid rig and current gun/Fang mechanics.
- Added a dedicated Roach Scout costume layer following the approved 3D reference sheet.
- Added forehead goggles with separate rims, dark lenses and bridge.
- Added a stylized brown hair crest over the temporary VRM hair silhouette.
- Rebuilt the antennae as longer segmented tubes with three orange bands and bright tips.
- Added a thick cream scarf collar and front flap.
- Added cream chest bib and crossed dark harness straps.
- Added brown/orange shoulder armor attached directly to the upper-arm bones.
- Rebuilt the back shell as a large segmented five-row shell with paired plates, horizontal seams and a bright central ridge.
- Added belt, metal buckle and side pouches on the hips.
- Added cream wrist cuffs, orange/dark knee armor and cream/orange/dark boot overlays.
- Added conservative material retinting by mesh/material name so recognizable hair/clothes/boots move toward the Roach Scout palette without blindly recoloring eyes/face details.
- Added lower-leg and foot humanoid bones to the character attachment map for later locomotion and equipment work.
- This is a visible in-game approximation on the temporary VRM rig, not the final generated custom mesh.
- The final production asset can replace the temporary VRM while keeping the same humanoid sockets and combat code.


## Build 009.5 — final character asset slot
- Production character loading order is now local Roach Scout VRM → local rigged Roach Scout GLB → pinned temporary VRM fallback.
- A missing local asset no longer requires code changes; the loader silently advances to the next source.
- Added standard humanoid bone-name recognition for Mixamo/Meshy/Blender-style GLB rigs.
- Rigged GLB characters can use the existing real-hand firearm position, Tin Fang socket and upper-body pose system.
- Final custom assets do not receive the temporary VRM's procedural costume overlays or material retinting.
- Added an explicit asset contract at assets/characters/README.md.
- Hugging Face TRELLIS generation was investigated, but the connected account returned HTTP 402 before a Job started because Jobs require a positive credit balance; no compute was charged.


## Build 010.1 — humanoid locomotion
- Implemented a locomotion state layer based on the architecture used by norio/vrm-game-starter / BVHEcctrl: IDLE, WALK, RUN, JUMP/FALL and landing recovery, extended for SHIFT with CROUCH, CROUCH_WALK and SLIDE.
- The reference starter maps movement state to animation clips and crossfades them; SHIFT now follows the same state separation while driving the current humanoid bones directly so it works immediately with both VRM and common rigged GLB characters.
- Legs now visibly alternate at walk/run cadence instead of remaining rigid.
- Upper legs swing with stride length based on walk/run state.
- Knees bend on the recovery leg and feet counter-rotate for a planted-step look.
- Run has a larger stride, faster cadence, hip roll and forward body lean.
- Backpedaling reverses gait phase instead of moonwalking with forward leg timing.
- Strafing adds small hip/leg lateral offsets while preserving the step cycle.
- Crouch no longer vertically squashes the whole avatar; gameplay collider still crouches while the visual character bends hips/knees and lowers the hip bone.
- Crouch-walk has its own shorter stride and cadence.
- Slide has a dedicated asymmetric leg pose instead of a compressed standing model.
- Jump/fall tuck and extend the legs separately and landing adds a short compression recovery.
- Upper-body gun/Fang poses are layered over locomotion, so the legs continue moving while aiming or holding the Tin Fang.
- Antennae lean/sway during movement and the segmented shell gets subtle run secondary motion.
- Added live debug Anim state to the performance HUD.
- Quaternius Universal Animation Library was reviewed as the clip source used by the GitHub starter; Quaternius publishes it under CC0. A later clip-retarget pass can replace the procedural gait without changing the movement-state architecture.


## Build 010.2 — authored locomotion clips
- Replaced the normal idle/walk/run procedural gait with real authored animation clips.
- Uses the CC0 Quaternius Universal Animation Library via the pinned AnimationLibrary.glb from norio/vrm-game-starter.
- Added src/vrm-locomotion.js with a VRM humanoid retargeter adapted from the MIT three-vrm / vrm-game-starter approach.
- Authored clips: Idle_Loop, Walk_Loop and Jog_Fwd_Loop.
- Animation state crossfades between idle, walk and run instead of snapping bone angles.
- Playback rate follows actual SHIFT movement speed to reduce visible foot skating.
- Backpedaling reverses clip playback when combat-facing movement is backward.
- Horizontal hips/root translation from the source clip is stripped because SHIFT physics owns world movement; authored vertical weight transfer is preserved.
- Mixer drives the full authored body first; gun/Fang upper-body overrides are applied afterward, so aiming can coexist with real leg animation.
- VRM update now runs after authored + gameplay pose layers so normalized-bone changes reach the rendered mesh in the same frame.
- Existing procedural crouch, crouch-walk, slide and airborne poses remain as fallback states until authored versions are added.
- If the animation library fails to load, Build 010.1 procedural locomotion remains available instead of breaking the character.


## Build 010.4 — weapon-driven ADS + two-hand IK
- Reworked ADS around the standard shooter hierarchy: crosshair/camera aim drives the weapon first, then both character arms follow weapon grip sockets.
- Reviewed Epic Aim Offset / Layered Blend Per Bone guidance, a PUBG-style Unreal prototype with stance-specific aim offsets, and a technical-animation project using FABRIK for the support hand.
- Every firearm now exposes a RightGripSocket and LeftForegripSocket.
- While RMB ADS is active, the firearm is no longer positioned from the current hand location. It is raised to a firing-shoulder anchor and aligned directly with the camera aim quaternion.
- The rear grip is positioned slightly forward/inward from the right shoulder so the rifle visibly rises to shoulder level.
- The weapon model preserves subtle ADS sway/recoil after crosshair alignment.
- Added final two-bone IK for both arms: shoulder -> elbow -> hand is solved against the weapon's live grip sockets every frame.
- Elbow pole targets keep the right elbow slightly out/down and the left elbow open toward the foregrip instead of collapsing both elbows into the torso.
- ADS upper-body aim now controls spine/chest/upper-chest/neck/shoulders only; upper arms, forearms and hands are owned by the final IK pass.
- Final frame order: locomotion -> torso aim offset -> weapon crosshair transform -> grip sockets -> two-hand IK -> VRM propagation -> render.
- Non-ADS gun carrying remains hand-led so this change is isolated to the aiming/shooting stance.
- The existing camera-first bullet trace remains authoritative; the visual muzzle then traces toward the same camera-selected aim point.


## Build 010.5 — unified firearm + Tin Fang combat poses
- Firearm shoulder stance is no longer RMB-only.
- Added WeaponSystem.combatPoseActive: true while ADS, while LMB is held, and for 0.30 s after the most recent shot.
- Hip-fire shooting now raises the firearm into the same two-hand shoulder shooting architecture as ADS, while keeping the normal third-person camera/FOV and hip-fire accuracy rules.
- The camera still zooms only on RMB; LMB fire changes character/weapon pose without pretending the player entered ADS.
- Final two-hand weapon IK now runs whenever combatPoseActive is true, so both hands grip the weapon while firing even without RMB.
- Combat facing/orientation warping also persists through the brief post-shot recovery window instead of dropping immediately after a semi-auto click.
- Tin Fang PRIMING/AIMING/RELEASE now carry the live camera pitch and relative camera yaw into the VRM animation layer.
- The real throwing hand now raises above/behind the head, elbow bends into a wind-up, right shoulder lifts, and upper chest twists toward the crosshair.
- Release starts from that raised pose and whips the real arm forward toward the cursor before follow-through.
- Low-ceiling compact throw keeps the same logic with a lower/tucked wind-up.
- Tap-V slash remains its own melee pose and does not reuse the throw wind-up.


## Build 010.7A — weapon feel: recoil + muzzle flash
- Built on top of the newer Build 010.6 Tin Fang/jump-era main branch without touching jump, landing, climbing or traversal code.
- Camera recoil is now spring-based rather than directly adding and damping an angle.
- Each shot adds pitch/yaw velocity; spring stiffness and damping produce a fast kick followed by a controlled return.
- ADS reduces visual camera recoil to 62% while keeping the weapon's gameplay spread/recoil model intact.
- Weapon model recoil is now its own physical spring with velocity, stiffness and damping instead of a one-value Z kick.
- Weapon mass changes how fast/strongly the model settles after recoil.
- Replaced the old glowing muzzle sphere with a compact multi-part muzzle burst:
  - bright core
  - two crossed additive flare planes
  - directional muzzle cone
  - four tiny sparks
  - short-lived local point light
  - smoke only after sustained fire
- Muzzle flash lifetime is now roughly 1–3 frames depending on weapon class instead of a lingering glow.
- Shotguns get a wider/brighter flash; scoped heavy weapons get a compact but intense burst.
- Sustained automatic fire gradually introduces a light smoke puff instead of smoke on every single shot.
- Muzzle FX remain attached to the existing runtime muzzle anchor, so they follow all current weapon/IK poses.
- Architecture was informed by Epic-style separation of camera shake/recoil from animation/VFX and by the open-source mshaheerz/fpp-tpp-shooter-starter separation of weapon stats, shooter logic, muzzle anchor, camera recoil and muzzle FX.


## Build 010.7B — real smooth crouch
- Reworked crouch after reviewing Epic locomotion/blend-space guidance and the open-source mshaheerz third-person shooter crouch system.
- Crouch is now treated as its own locomotion layer rather than a shallow bent-leg pose.
- Added an independent visual crouch blend so the rig eases into and out of crouch even though gameplay movement/collider state changes immediately.
- Authored standing locomotion remains disabled until the visual crouch blend is nearly back to zero, preventing the mixer from snapping the skeleton upright on key release.
- Pelvis now drops about 0.34 m at full crouch instead of only 0.15 m.
- Hips hinge and shift slightly backward while the spine/chest lean forward to keep the center of mass over the feet.
- Upper legs fold much deeper, knees flex past 1.2 rad, and ankles counter-rotate so the boots read as planted rather than dangling.
- Added slight leg abduction for a wider, more believable crouch base.
- Crouch-walk uses a dedicated short-stride cadence instead of reusing standing locomotion.
- Crouch strafing subtly biases thighs/hips while preserving the squat silhouette.
- Standing transition is intentionally slower than crouch entry, avoiding a robotic pop-up.
- Slide remains its own pose and is not overwritten by the crouch layer.
- No jump, landing, climbing, Tin Fang, gun IK, or weapon-feedback mechanics were modified.


## Build 010.7C — crouch IK fix
- Fixed the Build 010.7B failure where the avatar visually sank toward the floor while the legs stayed nearly straight.
- Removed the crouch's rig-axis-dependent thigh/knee Euler deformation as the main body solver.
- Added src/crouch-pose.js, a world-space planted-feet crouch layer.
- Crouch now captures both current foot positions first, lowers/moves the pelvis, then solves each thigh/knee chain back to its planted foot target with two-bone IK.
- Knee pole targets are biased forward and slightly outward, forcing a visible athletic knee bend instead of allowing the whole body to translate downward.
- Feet preserve their pre-crouch world orientation so soles stay flatter.
- Pelvis drops roughly 0.285 m and shifts slightly back; spine/chest counter-lean forward for balance.
- Crouch walking uses short world-space foot target offsets/lifts while preserving the squat.
- The crouch pose is applied after the locomotion mixer/updatePose and before VRM propagation, preventing authored locomotion from erasing the bend.
- Existing slide/jump/Tin Fang/weapon IK systems remain unchanged.


## Build 010.8 — Fortnite-style slide
- Reworked slide after checking Epic's Fortnite movement documentation and a GitHub UE5 physics-slide implementation.
- Fortnite behavior mirrored structurally:
  - hold crouch while running/sprinting to enter slide
  - weapon use remains available
  - flat-ground slide settles toward normal run speed
  - downhill ramps accelerate the slide according to slope direction/strength
  - uphill travel brakes harder
  - jump can cancel directly into the existing jump impulse
  - pressing sprint again cancels the slide early
- Slide entry now preserves current horizontal momentum instead of blindly replacing it with a fixed direction/speed.
- Added limited steering while sliding; WASD bends the momentum direction gradually instead of snapping the player.
- Added dedicated tunables: minimum entry speed, flat target speed, max slide speed, steering, downhill acceleration and uphill braking.
- Slide duration increased to 1.35 s for a readable skid while still decaying naturally on flat ground.
- Added src/slide-pose.js:
  - low pelvis/backward skid posture
  - one leg extended forward
  - opposite leg tucked with stronger knee bend
  - torso counter-lean
  - world-space leg IK rather than rig-axis Euler guesses
  - smooth enter/exit blend
- Slide pose only owns lower body, leaving gun/Fang upper-body aiming and firing free.
- Existing crouch IK, gun IK, Tin Fang mechanics, jump velocity and collision systems are preserved.


## Build 010.8A — tactical one-knee slide pose
- Replaced the previous split/skid silhouette with a tactical one-knee combat slide matching the provided visual reference.
- Right knee now folds under the body near the ground while the right lower leg trails backward.
- Left leg reaches forward-left with a strong bend instead of locking straight.
- Pelvis stays low and centered over the kneeling leg rather than being thrown far backward.
- Torso remains mostly upright with only a slight forward counter-lean, preserving a weapon-ready silhouette.
- Upper body is still untouched by the slide layer, so gun/Fang aiming and two-hand weapon IK remain available while sliding.
- Added phase shaping with slideProgress: fast drop-in, stable middle knee-slide, and softer recovery instead of a single frozen pose for the full slide.
- Leg placement remains world-space IK based, so the pose does not depend on VRM bone-axis conventions.
- Slide movement physics from Build 010.8 are unchanged.


## Build 010.8B — slide speed, both-knee bend, crouch-walk gait
- Fixed the tactical slide silhouette so BOTH knees visibly bend.
- Kneeling leg compression increased from 0.52 to 0.58.
- Lead leg compression increased substantially from 0.26 to 0.48 and its foot target was moved closer to the body so the knee cannot visually lock straight.
- Increased both knee pole strength so the forward leg also reads as a bent combat knee rather than an extended straight leg.
- SHIFT-specific slide speed now targets sprint speed on flat ground (8.4) instead of normal running speed (5.2), per user direction.
- Slide entry push increased from 9.4 to 10.2 and flat braking reduced, while downhill can still accelerate above sprint speed up to 13.5.
- Crouch-walk no longer uses near-invisible foot motion.
- Crouch stride increased from 0.055 m to 0.125 m and step lift from 0.020 m to 0.052 m.
- Added alternating foot lift/plant timing, lateral weight transfer and pelvis step bob/sway so crouch movement visibly reads as walking rather than gliding.
- Existing crouch depth, planted-foot IK, slide physics, gun IK, Tin Fang, and jump systems remain intact.


## Build 010.14 — responsive jump on the 010.13 baseline
- Original Fortnite-inspired tuning, not an extraction of Fortnite code or assets: 10 m/s takeoff, 31.25 m/s² ascent gravity, 40 m/s² descent gravity, and a 28 m/s fall cap.
- Approximately 1.60 m standing apex after 0.32 s; sprinting adds a modest 5% vertical impulse. Air steering preserves released takeoff momentum and cannot add sprint speed by toggling sprint in the air.
- 120 ms input buffering and 85 ms ledge grace, consumed once per jump; holding Space does not automatically repeat jumps.
- Lower-body takeoff/tuck/extension and impact-weighted landing compression; crouch and slide retain their own pose layers.
- Based on 12c5756 (010.13). Existing grounded sprint/crouch/slide behavior is preserved, including slide jump-cancel, alongside damage, reticles, junk weapons and the left-hip knife holster.
- Research: [Epic movement controls](https://dev.epicgames.com/documentation/fortnite/using-player-movement-devices?lang=en-US) and [public third-person motor](https://github.com/modcommunity/dot-player-controller/blob/main/addons/dot_player_controller/tp/core/dot_tps_motor.gd). Public documentation describes controls, not exact Battle Royale tuning values.
- Run the dependency-free motion checks with `node --test tests/jump-motion.test.mjs`.
- Local browser verification covered 15–144 FPS simulations, ceiling/ramp collisions, buffered/ledge jumps, airborne Fang use, and a direct grounded-controller comparison with 010.13 (zero position/velocity/blend difference in the exercised sprint/slide/crouch sequence).

## Build 010.15 — running jump silhouette

Replaced the paired knee tuck with a speed-scaled split stride: a raised lead knee,
trailing thigh and bent rear knee. The takeoff gait chooses the lead leg once per
jump. The stride stays open across the apex, reaches down during descent, and
blends into the ground gait over 160 ms (80 ms into crouch/slide). Only the jump
pose layer changes; physics, authored sprint/slide, weapons and Fang remain intact.

References: [Epic jump state transitions](https://dev.epicgames.com/documentation/en-us/unreal-engine/adding-character-animation-in-unreal-engine)
and [Quaternius animation viewer source](https://github.com/Quaternius/quaternius.github.io/blob/main/animviewer.html).
This is an original Fortnite-inspired pose, not extracted Fortnite animation or
an assertion of its proprietary implementation. The supplied running-jump image
informed the lead/trail silhouette. Browser inspection used the actual VRM at
rise, apex and descent for standing and sprint jumps; sprint apex knee separation
was 0.566 world units versus 0.288 for standing.


## Build 010.27B — synchronized weapon raise / lower
- Added one shared deterministic carry-to-combat easing curve used by both the weapon transform and the character upper body.
- Carry, hip-fire and ADS no longer change upper-body targets abruptly; the arms now blend from the class-specific carry pose into the combat pose using the same shoulder alpha that moves the gun.
- Added a small class-specific transition arc: the SMG is light/quick, AR neutral, shotgun heavier, and sniper heaviest.
- Raise moves slightly up/in toward the shoulder while lower follows a softer down/out return path, rather than looking like a reversed linear slide.
- Final carry, hip-fire and ADS endpoints are unchanged, preserving the existing recoil calibration, stable two-hand IK, crouch behavior and authored slide ownership.
- Added dependency-free tests for easing endpoints, monotonicity, arc shape and per-class transition separation.
- Architecture follows the existing layered stack: shared locomotion → weapon-class upper body → additive aim/recoil → final hand IK.


## Build 010.27C — weapon motion polish
- Reworked raise/lower direction handling so releasing aim or fire halfway through a raise cannot instantly flip the weapon arc.
- Transition direction now carries short-lived momentum and reverses continuously, creating a subtle anticipation on raise and weighted hang before lowering.
- Added a tiny two-phase settle curve: early lift/rotation followed by a restrained stock-plant correction near the shoulder, with zero offset at both calibrated endpoints.
- Added class-specific motion weight. SMG changes direction fastest; AR stays balanced; shotgun and sniper retain visibly heavier follow-through.
- Upper chest/spine now participate in the same settle timing so the character does not look like rigid arms moving a prop independently of the torso.
- Slide, crouch, jump, recoil endpoints, ADS calibration and final two-hand IK are unchanged.


## Build 010.27D — physical weapon size + weight
- Added explicit physical mass in kilograms and explicit rendered dimensions in meters for every firearm.
- Current class calibration: Tape-Rattler SMG 2.8 kg / 0.66 m, Staple-Slinger AR 3.5 kg / 0.84 m, Bug-Sprayer Shotgun 3.8 kg / 1.03 m, Marksman Sniper 9.5 kg / 1.14 m.
- Procedural weapon meshes are now measured after construction and normalized to their configured world-space width/height/length through a dependency-free, tested bounding-box scale calculation. This fixes the old problem where a nominal SMG could render almost rifle-length because each handmade mesh had a different native bounding box.
- Pickup models preserve their intentional larger presentation ratio, while held weapons use the physical dimensions exactly.
- Replaced the old dimensionless mass tuning with a bounded kg-to-handling conversion.
- Mass now affects shoulder raise/lower response, ADS pose response, mid-transition direction reversal, weapon recoil spring settling and fallback weapon transform inertia.
- Heavy weapons therefore feel slower and more planted; the SMG is visibly quicker. Player movement speed is intentionally unchanged, matching the Fortnite/Lyra style of weapon-specific upper-body handling rather than weapon-weight movement penalties.
- Existing slide ownership, crouch, jump, hit logic, damage values, ammunition and final two-hand IK were not changed.
