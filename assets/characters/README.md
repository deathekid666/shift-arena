# Roach Scout production character slot

SHIFT loads Character 01 in this order:

1. `/assets/characters/roach-scout.vrm`
2. `/assets/characters/roach-scout.glb`
3. pinned development VRM fallback

## Preferred production format

Use `roach-scout.vrm` when possible.

For a GLB, the mesh must be rigged as a humanoid. The loader recognizes common VRM, Mixamo and Blender-style names for:

- hips / pelvis
- chest / upper chest
- neck / head
- left/right upper arm
- left/right forearm
- left/right hand
- left/right thigh
- left/right calf
- left/right foot

Minimum required for gameplay integration:

- head
- hips
- both upper arms
- both hands

The final character should be around 1.7–1.8 m in authored humanoid proportion; SHIFT auto-fits the visual model to the existing gameplay capsule.

## Do not bake gameplay objects into the mesh

Keep these separate:

- firearms
- Tin Fang
- hitboxes
- collision capsule

Weapons and Fang are attached by runtime hand sockets.

## Art target

Use the approved Roach Scout turnaround as the source of truth:
cute anime/cartoon proportions, brown/orange/cream palette, large eyes, hair crest, long antennae, cream scarf/outfit, segmented shell, armored gloves/boots, no wings.
