# Sound effects

Every `.wav` in this folder is a **temporary synthesized placeholder**. To
replace one, drop a real `.mp3` with the same base name next to it — mp3 is
preferred over wav automatically (and if both are missing, a built-in
WebAudio tone plays instead). Keep one-shots short (under ~2s); they play at
the user's volume. `music` loops forever, so make sure it loops cleanly.

## App-wide

| File                | Played when                                     |
| ------------------- | ----------------------------------------------- |
| `music.wav`         | calm background loop: menus, zen and daily games |
| `music-game.wav`    | driving loop while a party match is being played |
| `hover.wav`         | mouse hovers any button                         |
| `click.wav`         | any button is clicked                           |
| `start.wav`         | a game is launched                              |
| `countdownTick.wav` | each 3-2-1 countdown tick                       |
| `countdownGo.wav`   | the countdown hits GO!                          |
| `win.wav`           | you win / clear a level                         |
| `lose.wav`          | you lose / the run ends                         |

## Shared game-action kit

| File         | Meant for                                  |
| ------------ | ------------------------------------------ |
| `point.wav`  | scoring a point / milestone (Flappy, Dino) |
| `flap.wav`   | Flappy Bird wing beat                      |
| `jump.wav`   | Dino / platformer jumps                    |
| `land.wav`   | landing on a platform                      |
| `spring.wav` | Doodle Jump springs                        |
| `bounce.wav` | ball bounces (Brick Breaker, Peggle)       |
| `brick.wav`  | a brick shatters                           |
| `peg.wav`    | a peg is struck                            |
| `merge.wav`  | 2048 tiles merging                         |
| `slide.wav`  | tiles/cars sliding                         |
| `place.wav`  | placing a tile/letter/piece                |
| `reveal.wav` | revealing a cell (Minesweeper)             |
| `flag.wav`   | flagging a cell                            |
| `drain.wav`  | sand draining                              |
| `bucket.wav` | Sand Play bucket opened                    |
| `pour.wav`   | Magic Sort pours                           |
| `pop.wav`    | pops (Untangle pins, bubbles)              |
| `error.wav`  | invalid move                               |
| `car.wav`    | Parking Jam car moves                      |
| `letter.wav` | typing letters (word games)                |
| `combo.wav`  | combos / chains                            |

## Mahjong & rooms

| File           | Played when                                   |
| -------------- | --------------------------------------------- |
| `tick.wav`     | each second during the last 10s of your timer |
| `draw.wav`     | any player draws a tile                       |
| `discard.wav`  | any player discards                           |
| `pong.wav`     | a pong is claimed                             |
| `chow.wav`     | a chow is claimed                             |
| `kong.wav`     | any kong (exposed / added / concealed)        |
| `yourTurn.wav` | it becomes your turn                          |

## Bomberman

| File             | Played when                  |
| ---------------- | ---------------------------- |
| `bomb.wav`       | a bomb is placed             |
| `boom.wav`       | a bomb explodes              |
| `powerup.wav`    | a power-up is collected      |
| `hurt.wav`       | hit but survived             |
| `eliminated.wav` | knocked out for good         |
| `gameOver.wav`   | the game ends with no winner |
