/*
  camera-controller.js
  三种视角：

  第一人称：从角色眼睛看出去。
  第二人称：镜头在角色前方看着角色。
  第三人称：镜头在角色后上方跟随。

  说明：
  “第二人称镜头”不是游戏行业的统一标准。
  这里采用电影机位式的解释。
*/

import * as THREE from "three";
import { CONFIG } from "./config.js";

export class CameraController {
  constructor(camera, player, input) {
    this.camera = camera;
    this.player = player;
    this.input = input;

    this.mode = 2;
    this.modeNames = ["第一人称", "第二人称", "第三人称"];

    this.yaw = 0;
    this.pitch = -0.2;

    this.cameraModeText = document.getElementById("cameraModeText");

    document.getElementById("cameraButton")
      .addEventListener("pointerdown", () => this.nextMode());
  }

  nextMode() {
    this.mode = (this.mode + 1) % 3;
    this.cameraModeText.textContent = this.modeNames[this.mode];
  }

  update(delta) {
    const look = this.input.consumeLookDelta();

    this.yaw -= look.x * CONFIG.camera.lookSensitivity;
    this.pitch -= look.y * CONFIG.camera.lookSensitivity;

    /*
      限制上下视角范围，
      防止镜头翻到头顶后上下颠倒。
    */
    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      -1.0,
      0.62
    );

    if (this.mode === 0) {
      this.updateFirstPerson();
    } else if (this.mode === 1) {
      this.updateSecondPerson(delta);
    } else {
      this.updateThirdPerson(delta);
    }
  }

  updateFirstPerson() {
    this.player.mesh.visible = false;

    const eye = this.player.position.clone();
    eye.y += CONFIG.camera.firstPersonEyeHeight;

    const direction = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    this.camera.position.copy(eye);
    this.camera.lookAt(eye.clone().add(direction));
  }

  updateSecondPerson(delta) {
    this.player.mesh.visible = true;

    const front = new THREE.Vector3(
      Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw)
    );

    const desired = this.player.position.clone()
      .addScaledVector(front, 8)
      .add(new THREE.Vector3(0, 4.0, 0));

    const smooth = 1 - Math.exp(-8 * delta);
    this.camera.position.lerp(desired, smooth);

    const target = this.player.position.clone();
    target.y += 0.7;
    this.camera.lookAt(target);
  }

  updateThirdPerson(delta) {
    this.player.mesh.visible = true;

    const horizontal =
      CONFIG.camera.thirdPersonDistance * Math.cos(this.pitch);

    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * horizontal,
      CONFIG.camera.thirdPersonHeight +
        Math.sin(-this.pitch) * CONFIG.camera.thirdPersonDistance,
      Math.cos(this.yaw) * horizontal
    );

    const desired = this.player.position.clone().add(offset);

    const smooth = 1 - Math.exp(-10 * delta);
    this.camera.position.lerp(desired, smooth);

    const target = this.player.position.clone();
    target.y += 0.55;
    this.camera.lookAt(target);
  }
}
