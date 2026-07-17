/*
  player.js
  角色控制器。

  我们不把角色完全交给“刚体物理”。
  而是自己控制：

  输入
  → 速度
  → 小步移动
  → 分别检查 X、Z、Y 碰撞
  → 得到最终位置

  这样更适合平台跳跃游戏。
*/

import * as THREE from "three";
import { CONFIG } from "./config.js";

/*
  Three.js 没有内置 moveTowards。

  这个小函数让 current 每次向 target 靠近，
  但一次最多变化 maximumChange。
*/
function moveTowards(current, target, maximumChange) {
  if (Math.abs(target - current) <= maximumChange) {
    return target;
  }

  return current + Math.sign(target - current) * maximumChange;
}

export class Player {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;

    this.position = new THREE.Vector3(0, 1.45, 8);
    this.spawnPosition = this.position.clone();
    this.velocity = new THREE.Vector3();

    this.radius = CONFIG.player.radius;
    this.height = CONFIG.player.height;
    this.grounded = false;

    this.mesh = this.createVisual();
    this.scene.add(this.mesh);
  }

  createVisual() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(this.radius, 0.72, 6, 12),
      new THREE.MeshStandardMaterial({
        color: 0xf1a43b,
        roughness: 0.5
      })
    );

    body.castShadow = true;
    group.add(body);

    // 这块深色小面片表示脸的朝向。
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.18, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x242a31 })
    );
    face.position.set(0, 0.32, -0.53);
    group.add(face);

    return group;
  }

  update(delta, input, cameraYaw) {
    delta = Math.min(delta, 0.05);

    const desired = new THREE.Vector3(
      input.move.x,
      0,
      -input.move.y
    );

    /*
      让“摇杆向上”永远表示朝镜头前方走，
      而不是固定朝世界里的某个方向。
    */
    desired.applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      cameraYaw
    );

    if (desired.lengthSq() > 0.001) {
      desired.normalize();

      this.velocity.x = moveTowards(
        this.velocity.x,
        desired.x * CONFIG.player.maxSpeed,
        CONFIG.player.acceleration * delta
      );

      this.velocity.z = moveTowards(
        this.velocity.z,
        desired.z * CONFIG.player.maxSpeed,
        CONFIG.player.acceleration * delta
      );

      const wantedYaw = Math.atan2(desired.x, desired.z);
      this.mesh.rotation.y = THREE.MathUtils.lerp(
        this.mesh.rotation.y,
        wantedYaw,
        0.18
      );
    } else {
      this.velocity.x = moveTowards(
        this.velocity.x,
        0,
        CONFIG.player.braking * delta
      );

      this.velocity.z = moveTowards(
        this.velocity.z,
        0,
        CONFIG.player.braking * delta
      );
    }

    if (input.consumeJump() && this.grounded) {
      this.velocity.y = CONFIG.player.jumpSpeed;
      this.grounded = false;
    }

    this.velocity.y -= CONFIG.player.gravity * delta;

    const movement = this.velocity.clone().multiplyScalar(delta);

    /*
      把一帧拆成最多 4 个小步骤。
      目的是避免高速时跨过薄墙或平台。
    */
    const steps = Math.max(
      1,
      Math.min(4, Math.ceil(movement.length() / 0.32))
    );

    movement.divideScalar(steps);
    this.grounded = false;

    for (let i = 0; i < steps; i++) {
      this.moveHorizontal("x", movement.x);
      this.moveHorizontal("z", movement.z);
      this.moveVertical(movement.y);
    }

    if (this.position.y < -10) {
      this.respawn();
    }

    this.checkSpikes();
    this.mesh.position.copy(this.position);
  }

  getBox(position = this.position) {
    /*
      当前版本用竖直长方体近似胶囊体。
      它不完美，但简单、稳定、容易理解。
    */
    return new THREE.Box3(
      new THREE.Vector3(
        position.x - this.radius,
        position.y - this.height / 2,
        position.z - this.radius
      ),
      new THREE.Vector3(
        position.x + this.radius,
        position.y + this.height / 2,
        position.z + this.radius
      )
    );
  }

  moveHorizontal(axis, amount) {
    if (amount === 0) return;

    const testPosition = this.position.clone();
    testPosition[axis] += amount;
    const testBox = this.getBox(testPosition);

    for (const solid of this.level.solidBoxes) {
      if (testBox.intersectsBox(solid)) {
        // 碰墙后停止该方向速度，不穿墙，也不被弹飞。
        this.velocity[axis] = 0;
        return;
      }
    }

    this.position.copy(testPosition);
  }

  moveVertical(amount) {
    if (amount === 0) return;

    const testPosition = this.position.clone();
    testPosition.y += amount;
    const testBox = this.getBox(testPosition);

    for (const solid of this.level.solidBoxes) {
      if (!testBox.intersectsBox(solid)) continue;

      if (amount < 0) {
        /*
          从上往下撞到平台：
          把脚准确放到平台顶面。
        */
        testPosition.y = solid.max.y + this.height / 2 + 0.001;
        this.position.copy(testPosition);
        this.velocity.y = 0;
        this.grounded = true;
      } else {
        // 向上撞到天花板，停止上升。
        this.velocity.y = 0;
      }

      return;
    }

    this.position.copy(testPosition);

    /*
      脚底再向下探测一点点。
      这是为了让角色站在第二个平台边缘时，
      依然能稳定识别“现在可以跳”。
    */
    const probePosition = this.position.clone();
    probePosition.y -= 0.065;
    const probeBox = this.getBox(probePosition);

    for (const solid of this.level.solidBoxes) {
      if (probeBox.intersectsBox(solid) && this.velocity.y <= 0) {
        this.grounded = true;
        return;
      }
    }
  }

  checkSpikes() {
    const box = this.getBox();

    for (const spike of this.level.spikeBoxes) {
      if (box.intersectsBox(spike)) {
        this.respawn();
        return;
      }
    }
  }

  respawn() {
    this.position.copy(this.spawnPosition);
    this.velocity.set(0, 0, 0);
  }
}
