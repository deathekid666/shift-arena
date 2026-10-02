# SHIFT Arena — Build 003

Browser-first third-person shooter prototype.

## Current scope
- Build 001 movement and corrected obstacle landing collision
- Build 002 TPS aiming + Tactical AR
- Player 100 HP + 100 Shield
- Shield-first damage routing
- Shield-break feedback
- Damage vignette and directional hit placeholder
- Elimination state
- Automatic respawn
- Health + shield HUD
- Controlled damage test pads
- Stationary weapon-test dummies

## Controls
- WASD: move
- Mouse: look
- Shift: sprint
- Ctrl: crouch / slide
- Space: jump
- Left mouse: fire
- Right mouse: ADS
- R: reload
- Esc: release pointer

## Build 003 damage test
Near spawn:
- Orange pad: 30 damage once per entry
- Red pad: 80 damage once per entry

Expected sequence from full health:
1. Orange pad → 100 HP / 70 Shield
2. Leave it, then enter red pad → 90 HP / 0 Shield
3. Shield-break feedback triggers
4. Continue taking damage until 0 HP → eliminated → respawn with 100 HP / 100 Shield

Movement, camera and weapon tuning remain configurable defaults. Player-facing settings will expose tuning later.
