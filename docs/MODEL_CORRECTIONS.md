# Model corrections after the Phase 9 screenshot review

Baseline: `fa6b1901efaec66fdba37c52c59d1cbf05d96a37`. This follow-up corrects the
six concrete geometry issues reported in the user's screenshots. It supersedes
the earlier audit's conclusion that the keyboard proportions, lid/prop and music
desk were already adequate. Front-view screenshots alone missed these problems.

## Keyboard proportions and travel

The conventional octave reference is 165.1 mm from the
[DS Standard Foundation's keyboard research](https://dsstandardfoundation.org/our-research/).
The [Kawai grand regulation manual](https://kawaius.com/wp-content/uploads/2019/04/Kawai-Grand-Piano-Regulation-Manual.pdf)
uses a 10.1 mm key-dip block. These are references for proportions and travel,
not a claim that this procedural instrument is a certified physical replica.

Using 208 mm per model unit as a keyboard-width normalization:

| Measurement                   |        Before |         After |
| ----------------------------- | ------------: | ------------: |
| Octave span                   |      184.8 mm |      165.2 mm |
| Complete keyboard span        |    1,372.8 mm |    1,227.2 mm |
| White key surface width       |       24.3 mm |       22.9 mm |
| White visible key length      |      212.2 mm |      149.8 mm |
| Black key surface width       |       13.6 mm |       13.7 mm |
| Black visible key length      |      133.1 mm |       91.5 mm |
| White-key front travel        | about 23.4 mm | about 10.0 mm |
| Keyboard / maximum case width |         88.7% |         79.3% |

White/black key lengths are modeling choices consistent with the corrected
widths, not manufacturer specifications. Meshes now read width, length and
height from the shared layout. Cheek blocks and the fallboard were repositioned
to meet the narrower, shorter keyboard without leaving an exposed gap behind it.

The previous white-key rotation lowered its front farther than the clearance
above the solid keybed. Travel is now derived from a bounded dip, and rest height
provides clearance at full depression. Holding the key does not accumulate a
translation; the original problem was its excessive target rotation and missing
clearance. Audio ownership and key/hammer event handling are unchanged.

This remains a stylized grand: the existing body depth and vertical proportions
are not a dimensionally accurate concert grand. For comparison, the
[Steinway D-274](https://eu.steinway.com/en/pianos/grand-pianos/d-274) is 274 cm long.
No whole-instrument rescaling or string-layout rewrite was attempted in this fix.

## Pedals, lid and music desk

| Reported problem                           | Cause                                                                                                                         | Correction                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pedal toes look like detached wheels       | Capsule was flattened along its length before rotation, with a gap to its arm                                                 | Rotate the shared geometry first, flatten vertically, and overlap the horizontal toe plate with the arm; anchor the lyre stay at both ends                         |
| Lid looks misplaced                        | Independently drawn contour drifted inside the treble rim; closed underside intersected trim; prop base sat inside the cavity | Clip the actual case contour at the belly rail, add closed clearance, align hinge markers, place prop base on the treble rim and derive its top from the lid pivot |
| Exploded lid intersects overhead lamp      | Fixed decorative fixture occupied the exploded stack                                                                          | Hide only fixture geometry throughout exploded mode and both transitions; restore in landscape Normal mode; light sources remain                                   |
| Music desk leans forward / score is hidden | Positive X tilt leans toward the player; tall fallboard blocks low page edges                                                 | Tilt backward, lower/reposition fallboard, seat the rack ledge above it, and raise pages with their board                                                          |

The lid/prop update now lives with the lid geometry and runs at construction too,
so exploded bounds capture the actual initial assembly. It uses the same two
attachment points throughout opening/closing. The prop hides when closed.

## Verification

`npm test` includes three new geometry checks using actual Three.js meshes:
all 88 keys held for 3,600 simulated frames (one minute) stay above the keybed and
return fully; all three pedal toes remain connected, horizontal and above the
floor under depression; closed lid clears trim and its prop endpoints remain
attached at several angles.

The browser regression also passed with actual rendering/audio: a five-second
held key stays above the bed, rack top leans away from the player, page bottoms
and rack base clear the fallboard, and the lamp hides/restores across modes.
The pointer test now projects the actual key surface dimensions rather than a
hard-coded point above the old longer key. Glissando, overlapping sources,
multiple synthetic pointers, sustain, recording, autoplay and 15 viewport sizes
passed. Synthetic input is not physical MIDI/multi-touch hardware coverage.

Repeatable Side / music desk, Keyboard close-up, Lid hinge and Pedal close-up
buttons were added only to `tests/browser.html`, not the production interface.
These views were inspected alongside the four user screenshots. The browser
suite is a development entrypoint; it is excluded from the production build.

No audio assets, dependencies, material palette or light intensities changed.
The existing large Three.js bundle advisory remains.
