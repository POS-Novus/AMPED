# Character animations from Runway

The game's characters are single flat pictures. Code can move their head, torso and legs
(the rig in `game/js/scene.js`), but it cannot raise an arm or move hands on an instrument:
those poses aren't drawn. Animated clips made in Runway replace the rig for any character
that has them.

## 1. Pick a still

`inputs/` has one image per character look and role: the character, the instrument the game
gives them, on flat green, with room above for raised arms and jumps (832×1104, Runway's 3:4).
Make more with:

```
(cd game && python3 -m http.server 8800) &
NODE_PATH=$(npm root -g) node tools/runway/make_inputs.js punks_a_base:drums nia-metal:guitar
```

## 2. Generate in Runway (image to video)

- Model: Gen-4 (or newer), **ratio 832:1104 (3:4 portrait)**, 5 s is enough.
- Upload the still as the first frame. Use one prompt per move (below).
- Keep what works: the camera must not move and the feet should stay roughly in place.
- Optional: Runway's background removal / green screen tool. Export with transparency
  (WebM or MOV) and the converter uses it directly; otherwise it keys out the green itself.

Start every prompt with:

> Locked-off static camera, full body always in frame, flat plain green background, no other people,
> no camera movement, keep the exact character design, colours and outfit, clean 2D cartoon animation.

Then add one of:

| Move | File name ends in | Prompt |
|---|---|---|
| Playing (the main loop) | `__play` | The musician plays their instrument to a fast rock beat: strumming hand moving, fretting fingers moving, nodding the head, slight knee bounce. Seamless loop. |
| Headbang | `__headbang` | The musician headbangs hard to the beat, hair flying, still playing, feet planted. Seamless loop. |
| Fist to the crowd | `__fist` | The musician raises a fist high to the audience and shouts, then returns to playing. |
| Dance | `__dance` | The musician dances to the beat, stepping side to side and bouncing, still playing. Seamless loop. |
| Jump | `__jump` | The musician jumps in the air with the instrument and lands on the beat. |
| Work the crowd | `__crowd` | The musician points to the audience, then claps above the head, encouraging the crowd. Seamless loop. |

Drummers: say "hits the drums and cymbals with the sticks" instead of strumming. Singers: "sings into the microphone".

## 3. Bring them into the game

Save each clip in `design/animations/clips/` named after its still plus the move:

```
design/animations/clips/nia__guitar__play.mp4
design/animations/clips/nia__guitar__headbang.mp4
design/animations/clips/saoirse__drums__play.mp4
```

Then run `python3 tools/prepare_animations.py` and commit. Only `__play` is required; the other moves are
used when they exist (jump into the chorus, headbang or dance in the chorus, fist after a 10-note run,
working the crowd in quiet parts). Every clip is slowed or sped up to the song's beat.

If uploading video here is awkward, put the clips in Google Drive and I'll take them from there.
