# Custom sound effects

Drop `.mp3` files in this folder to replace the built-in synthesized sounds.
Any file that is missing simply falls back to the default tone.

| File           | Played when                                  |
| -------------- | -------------------------------------------- |
| `tick.mp3`     | each second during the last 10s of your timer |
| `draw.mp3`     | any player draws a tile                       |
| `discard.mp3`  | any player discards                           |
| `pong.mp3`     | a pong is claimed                             |
| `chow.mp3`     | a chow is claimed                             |
| `kong.mp3`     | any kong (exposed / added / concealed)        |
| `win.mp3`      | you win the round                             |
| `lose.mp3`     | someone else wins the round                   |
| `yourTurn.mp3` | it becomes your turn                          |

Keep them short (under ~2s); they are played as-is at the user's volume.
