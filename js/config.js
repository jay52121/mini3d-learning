/*
  config.js
  所有容易调整的数字都放在这里。

  这样以后调速度、跳跃高度、镜头距离时，
  不需要去每个文件里到处找。
*/

export const CONFIG = {
  player: {
    radius: 0.52,
    height: 1.8,
    maxSpeed: 6.0,
    acceleration: 26,
    braking: 34,
    jumpSpeed: 8.3,
    gravity: 22
  },

  camera: {
    thirdPersonDistance: 7.2,
    thirdPersonHeight: 3.3,
    firstPersonEyeHeight: 1.52,
    lookSensitivity: 0.0045
  }
};
