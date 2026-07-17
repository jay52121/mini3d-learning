/*
  main.js
  游戏入口。

  负责把：
  输入、关卡、玩家、镜头、游戏循环
  组装到一起。
*/

import * as THREE from "three";
import { InputController } from "./input.js";
import { Level } from "./level.js";
import { Player } from "./player.js";
import { CameraController } from "./camera-controller.js";

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  62,
  innerWidth / innerHeight,
  0.1,
  200
);

/*
  摄像机的上方固定为世界 Y 轴。
  这是避免镜头翻转的基础设置。
*/
camera.up.set(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

document.body.prepend(renderer.domElement);

const input = new InputController();
const level = new Level(scene);
const player = new Player(scene, level);
const cameraController = new CameraController(camera, player, input);

const stateText = document.getElementById("stateText");

document.getElementById("resetButton")
  .addEventListener("pointerdown", () => player.respawn());

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});

const clock = new THREE.Clock();

function gameLoop() {
  requestAnimationFrame(gameLoop);

  const delta = Math.min(clock.getDelta(), 0.05);

  /*
    顺序非常重要：

    1. 更新角色
    2. 更新镜头
    3. 绘制画面
  */
  player.update(delta, input, cameraController.yaw);
  cameraController.update(delta);

  stateText.textContent = player.grounded ? "站在地面" : "空中";

  renderer.render(scene, camera);
}

camera.position.set(0, 5, 12);
gameLoop();
