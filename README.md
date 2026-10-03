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
