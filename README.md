# SHIFT Arena — Build 004

Browser-first third-person shooter prototype.

## Current scope
- Build 001 movement + corrected vertical obstacle collision
- Build 002 TPS aiming + Tactical AR
- Build 003 HP / Shield / elimination / respawn
- Build 004 first combat bot
- Bot state machine: IDLE → CHASE / SEARCH → ATTACK → DEAD → RESPAWN
- Bot line-of-sight checks against world geometry
- Bot cannot damage the player through walls
- Bot body/head hit zones use the same player weapon pipeline
- Bot health feedback and respawn
- Stationary weapon-test dummies retained
- Build 003 orange/red damage pads retained for regression testing

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

Bot combat numbers are development defaults and live in src/config.js so they can be tuned later without rewriting AI.
