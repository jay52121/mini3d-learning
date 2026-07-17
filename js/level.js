/*
  level.js
  负责地图、平台、墙、尖刺和光照。
*/

import * as THREE from "three";

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.solidBoxes = [];
    this.spikeBoxes = [];

    this.buildLight();
    this.buildLevel();
  }

  buildLight() {
    this.scene.background = new THREE.Color(0x8ed4f8);
    this.scene.fog = new THREE.Fog(0x8ed4f8, 38, 105);

    // 天空光：让阴影面不是死黑。
    const skyLight = new THREE.HemisphereLight(
      0xffffff,
      0x3b4a5c,
      1.65
    );
    this.scene.add(skyLight);

    // 太阳光：产生清晰的方向光和阴影。
    const sun = new THREE.DirectionalLight(0xfff2d5, 3.0);
    sun.position.set(-14, 22, 11);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    this.scene.add(sun);
  }

  createBox({ x, y, z, width, height, depth, color }) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.78,
        metalness: 0.03
      })
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    mesh.updateMatrixWorld(true);

    // Box3 是看不见的碰撞边界。
    const box = new THREE.Box3().setFromObject(mesh);
    this.solidBoxes.push(box);

    return mesh;
  }

  createSpikeRow({ x, y, z, count, spacing = 0.78 }) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x8e2b2b,
      roughness: 0.4,
      metalness: 0.32
    });

    for (let i = 0; i < count; i++) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.34, 1.25, 10),
        material
      );

      spike.position.set(
        x + (i - (count - 1) / 2) * spacing,
        y + 0.625,
        z
      );

      spike.castShadow = true;
      spike.receiveShadow = true;
      this.scene.add(spike);

      spike.updateMatrixWorld(true);

      /*
        尖刺外观看起来尖，
        碰撞盒稍微缩小一点，
        避免玩家“还没碰到尖端就死”。
      */
      const box = new THREE.Box3().setFromObject(spike);
      box.expandByScalar(-0.08);
      this.spikeBoxes.push(box);
    }
  }

  buildLevel() {
    this.createBox({
      x: 0, y: -0.5, z: 4,
      width: 14, height: 1, depth: 18,
      color: 0x5d8a62
    });

    this.createBox({
      x: 0, y: 0.35, z: -9,
      width: 11, height: 1, depth: 7,
      color: 0x6b9468
    });

    this.createBox({
      x: 4, y: 1.1, z: -18,
      width: 9, height: 1, depth: 8,
      color: 0x567b59
    });

    // 灰墙也是真碰撞，不只是装饰。
    this.createBox({
      x: -5.7, y: 2.0, z: 1,
      width: 1.2, height: 5, depth: 12,
      color: 0x5b6673
    });

    this.createBox({
      x: 5.4, y: 2.4, z: -9,
      width: 1.2, height: 5, depth: 7,
      color: 0x5b6673
    });

    this.createSpikeRow({
      x: 0,
      y: 0,
      z: -1,
      count: 6
    });

    this.createSpikeRow({
      x: 4,
      y: 1.6,
      z: -18,
      count: 5
    });
  }
}
