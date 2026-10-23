import "./styles/game.css";
import Phaser from "phaser";
import { GameScene } from "./game/scenes/GameScene";
import { W, H } from "./game/data/constants";

function fit() {
  const available = Math.min(innerWidth / W, innerHeight / H);
  const scale = available >= 1 ? Math.floor(available) : available;
  const stage = document.getElementById("stage");
  if (stage) {
    stage.style.width = `${W * scale}px`;
    stage.style.height = `${H * scale}px`;
  }
}
fit();
window.addEventListener("resize", fit);
await document.fonts
  .load('16px "Press Start 2P"')
  .catch((error) => console.warn("像素字体未加载，使用系统后备字体", error));
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: W,
  height: H,
  backgroundColor: "#1a1c2c",
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  banner: false,
  scale: { mode: Phaser.Scale.NONE },
  scene: [GameScene],
  audio: { noAudio: true },
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    window.removeEventListener("resize", fit);
    game.destroy(true);
  });
