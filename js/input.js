/*
  input.js
  只负责读取输入，不直接移动角色。

  支持：
  1. 左半屏动态摇杆
  2. 右半屏滑动镜头
  3. 键盘
  4. iPad 倾斜移动
*/

import * as THREE from "three";

export class InputController {
  constructor() {
    this.move = new THREE.Vector2();
    this.joystickMove = new THREE.Vector2();
    this.keyboardMove = new THREE.Vector2();
    this.tiltMove = new THREE.Vector2();

    this.lookDelta = new THREE.Vector2();
    this.jumpPressed = false;

    this.movePointerId = null;
    this.lookPointerId = null;

    this.moveZone = document.getElementById("moveZone");
    this.lookZone = document.getElementById("lookZone");
    this.joystickBase = document.getElementById("joystickBase");
    this.joystickKnob = document.getElementById("joystickKnob");
    this.jumpButton = document.getElementById("jumpButton");

    this.tiltButton = document.getElementById("tiltButton");
    this.tiltOffButton = document.getElementById("tiltOffButton");
    this.tiltStatusText = document.getElementById("tiltStatusText");

    this.joystickCenter = new THREE.Vector2();
    this.lastLookPosition = new THREE.Vector2();
    this.joystickRadius = 54;
    this.joystickOuterRadius = 64;

    this.tiltEnabled = false;
    this.tiltCalibrated = false;
    this.waitingForCalibration = false;
    this.orientationListenerAdded = false;
    this.motionListenerAdded = false;
    this.receivedOrientationData = false;

    this.tiltZero = new THREE.Vector2();
    this.filteredTilt = new THREE.Vector2();
    this.tiltDeadZone = 0.035;
    this.tiltMax = 0.26;
    this.tiltSmoothing = 0.18;
    this.tiltDataTimer = null;

    this.handleOrientation = this.handleOrientation.bind(this);
    this.handleMotion = this.handleMotion.bind(this);

    this.bindTouch();
    this.bindKeyboard();
    this.bindTiltControls();
  }

  /*
    ============================================================
    左侧动态摇杆
    ============================================================
  */

  bindTouch() {
    this.moveZone.addEventListener("pointerdown", (event) => {
      if (this.movePointerId !== null) return;

      event.preventDefault();
      this.movePointerId = event.pointerId;

      try {
        this.moveZone.setPointerCapture(event.pointerId);
      } catch (_) {
        // 某些 Safari 状态下可能不能捕获，后面的全局松手仍会兜底。
      }

      const rect = this.moveZone.getBoundingClientRect();

      /*
        event.clientX / clientY 是整个屏幕的坐标，
        但摇杆是放在 moveZone 里面的。

        以前直接把屏幕坐标写给摇杆，
        会把 moveZone 自己的顶部偏移再加一次，
        所以摇杆可能一路跑到屏幕下面。

        这里先换算成 moveZone 内部坐标，再限制在边缘以内。
      */
      const localX = THREE.MathUtils.clamp(
        event.clientX - rect.left,
        this.joystickOuterRadius,
        Math.max(this.joystickOuterRadius, rect.width - this.joystickOuterRadius)
      );

      const localY = THREE.MathUtils.clamp(
        event.clientY - rect.top,
        this.joystickOuterRadius,
        Math.max(this.joystickOuterRadius, rect.height - this.joystickOuterRadius)
      );

      this.joystickCenter.set(
        rect.left + localX,
        rect.top + localY
      );

      this.joystickBase.style.left = `${localX}px`;
      this.joystickBase.style.top = `${localY}px`;
      this.joystickBase.style.display = "block";

      this.updateJoystick(event.clientX, event.clientY);
    });

    this.moveZone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.movePointerId) return;
      event.preventDefault();
      this.updateJoystick(event.clientX, event.clientY);
    });

    const releaseFromEvent = (event) => {
      if (
        this.movePointerId !== null &&
        (!event || event.pointerId === undefined || event.pointerId === this.movePointerId)
      ) {
        this.releaseJoystick();
      }
    };

    /*
      iPad Safari 偶尔会丢掉元素自己的 pointerup。
      所以元素、窗口、失去捕获、页面隐藏都做一次兜底。
    */
    this.moveZone.addEventListener("pointerup", releaseFromEvent);
    this.moveZone.addEventListener("pointercancel", releaseFromEvent);
    this.moveZone.addEventListener("lostpointercapture", releaseFromEvent);
    window.addEventListener("pointerup", releaseFromEvent, true);
    window.addEventListener("pointercancel", releaseFromEvent, true);
    window.addEventListener("blur", () => this.releaseAllPointers());

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.releaseAllPointers();
    });

    /*
      ============================================================
      右侧滑动镜头
      ============================================================
    */

    this.lookZone.addEventListener("pointerdown", (event) => {
      if (this.lookPointerId !== null) return;

      event.preventDefault();
      this.lookPointerId = event.pointerId;

      try {
        this.lookZone.setPointerCapture(event.pointerId);
      } catch (_) {}

      this.lastLookPosition.set(event.clientX, event.clientY);
    });

    this.lookZone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.lookPointerId) return;

      event.preventDefault();
      this.lookDelta.x += event.clientX - this.lastLookPosition.x;
      this.lookDelta.y += event.clientY - this.lastLookPosition.y;
      this.lastLookPosition.set(event.clientX, event.clientY);
    });

    const releaseLook = (event) => {
      if (
        this.lookPointerId !== null &&
        (!event || event.pointerId === undefined || event.pointerId === this.lookPointerId)
      ) {
        this.lookPointerId = null;
      }
    };

    this.lookZone.addEventListener("pointerup", releaseLook);
    this.lookZone.addEventListener("pointercancel", releaseLook);
    this.lookZone.addEventListener("lostpointercapture", releaseLook);
    window.addEventListener("pointerup", releaseLook, true);
    window.addEventListener("pointercancel", releaseLook, true);

    this.jumpButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.jumpPressed = true;
    });
  }

  updateJoystick(x, y) {
    const dx = x - this.joystickCenter.x;
    const dy = y - this.joystickCenter.y;
    const distance = Math.hypot(dx, dy);

    const limited = Math.min(distance, this.joystickRadius);
    const angle = Math.atan2(dy, dx);
    const knobX = Math.cos(angle) * limited;
    const knobY = Math.sin(angle) * limited;

    this.joystickKnob.style.transform =
      `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

    if (distance < 4) {
      this.joystickMove.set(0, 0);
    } else {
      this.joystickMove.set(
        knobX / this.joystickRadius,
        -knobY / this.joystickRadius
      );
    }

    this.refreshMove();
  }

  releaseJoystick() {
    this.movePointerId = null;
    this.joystickMove.set(0, 0);
    this.joystickBase.style.display = "none";
    this.joystickKnob.style.transform = "translate(-50%, -50%)";
    this.refreshMove();
  }

  releaseAllPointers() {
    this.releaseJoystick();
    this.lookPointerId = null;
    this.lookDelta.set(0, 0);
  }

  /*
    ============================================================
    键盘
    ============================================================
  */

  bindKeyboard() {
    const pressed = new Set();

    window.addEventListener("keydown", (event) => {
      pressed.add(event.code);

      if (event.code === "Space") {
        event.preventDefault();
        this.jumpPressed = true;
      }

      this.updateKeyboard(pressed);
    });

    window.addEventListener("keyup", (event) => {
      pressed.delete(event.code);
      this.updateKeyboard(pressed);
    });
  }

  updateKeyboard(pressed) {
    let x = 0;
    let y = 0;

    if (pressed.has("KeyA") || pressed.has("ArrowLeft")) x -= 1;
    if (pressed.has("KeyD") || pressed.has("ArrowRight")) x += 1;
    if (pressed.has("KeyW") || pressed.has("ArrowUp")) y += 1;
    if (pressed.has("KeyS") || pressed.has("ArrowDown")) y -= 1;

    this.keyboardMove.set(x, y);

    if (this.keyboardMove.lengthSq() > 1) {
      this.keyboardMove.normalize();
    }

    this.refreshMove();
  }

  /*
    ============================================================
    iPad 倾斜控制
    ============================================================
  */

  bindTiltControls() {
    /*
      Safari 对“用户主动点击”要求很严格。
      这里改用 click，而不是 pointerdown。
    */
    this.tiltButton.addEventListener("click", async (event) => {
      event.preventDefault();

      if (this.tiltEnabled) {
        this.requestTiltCalibration();
      } else {
        await this.enableTilt();
      }
    });

    this.tiltOffButton.addEventListener("click", (event) => {
      event.preventDefault();
      this.disableTilt();
    });

    const recalibrateAfterRotation = () => {
      if (this.tiltEnabled) {
        this.requestTiltCalibration("转屏后请保持姿势");
      }
    };

    if (screen.orientation?.addEventListener) {
      screen.orientation.addEventListener("change", recalibrateAfterRotation);
    } else {
      window.addEventListener("orientationchange", recalibrateAfterRotation);
    }
  }

  async enableTilt() {
    const orientationClass = window.DeviceOrientationEvent;
    const motionClass = window.DeviceMotionEvent;

    if (!orientationClass && !motionClass) {
      this.setTiltStatus("设备不支持");
      return;
    }

    try {
      /*
        部分 iPadOS 版本把权限放在 DeviceOrientationEvent，
        部分版本也会在 DeviceMotionEvent 上提供同一个入口。

        两个请求都必须在点击产生的同一段同步代码里启动，
        不能等第一个结束后再请求第二个，否则会失去“用户点击”资格。
      */
      const permissionRequests = [];

      if (typeof orientationClass?.requestPermission === "function") {
        permissionRequests.push(orientationClass.requestPermission());
      }

      if (typeof motionClass?.requestPermission === "function") {
        permissionRequests.push(motionClass.requestPermission());
      }

      if (permissionRequests.length > 0) {
        const results = await Promise.all(permissionRequests);

        if (results.some((result) => result !== "granted")) {
          this.setTiltStatus("权限未允许");
          return;
        }
      }

      if (!this.orientationListenerAdded && orientationClass) {
        window.addEventListener(
          "deviceorientation",
          this.handleOrientation,
          true
        );
        this.orientationListenerAdded = true;
      }

      /*
        devicemotion 是备用通道。
        如果某个 Safari 版本不发送方向角，仍可尝试读取重力方向。
      */
      if (!this.motionListenerAdded && motionClass) {
        window.addEventListener(
          "devicemotion",
          this.handleMotion,
          true
        );
        this.motionListenerAdded = true;
      }

      this.tiltEnabled = true;
      this.receivedOrientationData = false;
      this.tiltButton.textContent = "重新校准";
      this.tiltOffButton.hidden = false;
      this.requestTiltCalibration("保持当前姿势");

      clearTimeout(this.tiltDataTimer);
      this.tiltDataTimer = setTimeout(() => {
        if (this.tiltEnabled && !this.tiltCalibrated) {
          this.setTiltStatus("未收到感应数据");
        }
      }, 2500);
    } catch (error) {
      console.error("无法开启重力感应：", error);

      const name = error?.name || "";

      if (name === "NotAllowedError" || name === "SecurityError") {
        this.setTiltStatus("Safari未授权");
      } else {
        this.setTiltStatus("开启失败");
      }
    }
  }

  disableTilt() {
    this.tiltEnabled = false;
    this.tiltCalibrated = false;
    this.waitingForCalibration = false;
    this.receivedOrientationData = false;

    clearTimeout(this.tiltDataTimer);

    this.tiltMove.set(0, 0);
    this.filteredTilt.set(0, 0);

    this.tiltButton.textContent = "开启感应";
    this.tiltOffButton.hidden = true;

    this.setTiltStatus("关闭");
    this.refreshMove();
  }

  requestTiltCalibration(message = "正在校准") {
    this.waitingForCalibration = true;
    this.tiltCalibrated = false;
    this.tiltMove.set(0, 0);
    this.filteredTilt.set(0, 0);
    this.setTiltStatus(message);
    this.refreshMove();
  }

  handleOrientation(event) {
    if (!this.tiltEnabled) return;
    if (event.beta === null || event.gamma === null) return;

    this.receivedOrientationData = true;

    const screenTilt = this.getScreenTilt(
      event.beta,
      event.gamma
    );

    this.acceptTiltSample(screenTilt);
  }

  handleMotion(event) {
    if (!this.tiltEnabled || this.receivedOrientationData) return;

    const gravity = event.accelerationIncludingGravity;
    if (!gravity || gravity.x === null || gravity.y === null) return;

    /*
      这是方向角数据不可用时的备用方案。
      除以约 9.81，把重力加速度缩放到大约 -1 到 1。
    */
    let deviceX = gravity.x / 9.81;
    let deviceY = gravity.y / 9.81;

    /*
      iOS 某些版本的重力符号与方向角相反。
      校准会消除静态偏差，这里只统一倾斜方向。
    */
    deviceX = -deviceX;
    deviceY = -deviceY;

    const screenTilt = this.rotateDeviceTiltToScreen(
      deviceX,
      deviceY
    );

    this.acceptTiltSample(screenTilt);
  }

  acceptTiltSample(screenTilt) {
    if (this.waitingForCalibration || !this.tiltCalibrated) {
      this.tiltZero.copy(screenTilt);
      this.filteredTilt.set(0, 0);
      this.tiltMove.set(0, 0);
      this.waitingForCalibration = false;
      this.tiltCalibrated = true;
      clearTimeout(this.tiltDataTimer);
      this.setTiltStatus("已开启");
      this.refreshMove();
      return;
    }

    const difference = screenTilt.clone().sub(this.tiltZero);

    const target = new THREE.Vector2(
      this.applyTiltDeadZone(difference.x),
      this.applyTiltDeadZone(-difference.y)
    );

    this.filteredTilt.lerp(target, this.tiltSmoothing);
    this.tiltMove.copy(this.filteredTilt);

    if (this.tiltMove.lengthSq() > 1) {
      this.tiltMove.normalize();
    }

    this.refreshMove();
  }

  getScreenTilt(betaDegrees, gammaDegrees) {
    const beta = THREE.MathUtils.degToRad(betaDegrees);
    const gamma = THREE.MathUtils.degToRad(gammaDegrees);

    const deviceX = Math.sin(gamma) * Math.cos(beta);
    const deviceY = Math.sin(beta);

    return this.rotateDeviceTiltToScreen(deviceX, deviceY);
  }

  rotateDeviceTiltToScreen(deviceX, deviceY) {
    const angle = this.getScreenAngle();

    if (angle === 90) {
      return new THREE.Vector2(deviceY, -deviceX);
    }

    if (angle === 270) {
      return new THREE.Vector2(-deviceY, deviceX);
    }

    if (angle === 180) {
      return new THREE.Vector2(-deviceX, -deviceY);
    }

    return new THREE.Vector2(deviceX, deviceY);
  }

  getScreenAngle() {
    let angle = 0;

    if (
      screen.orientation &&
      typeof screen.orientation.angle === "number"
    ) {
      angle = screen.orientation.angle;
    } else if (typeof window.orientation === "number") {
      angle = window.orientation;
    }

    return ((angle % 360) + 360) % 360;
  }

  applyTiltDeadZone(value) {
    const amount = Math.abs(value);

    if (amount <= this.tiltDeadZone) return 0;

    const usableRange = this.tiltMax - this.tiltDeadZone;

    const normalized = THREE.MathUtils.clamp(
      (amount - this.tiltDeadZone) / usableRange,
      0,
      1
    );

    return Math.sign(value) * normalized;
  }

  setTiltStatus(text) {
    this.tiltStatusText.textContent = text;
  }

  /*
    ============================================================
    选择最终移动方式
    ============================================================
  */

  refreshMove() {
    if (this.movePointerId !== null) {
      this.move.copy(this.joystickMove);
      return;
    }

    if (this.keyboardMove.lengthSq() > 0) {
      this.move.copy(this.keyboardMove);
      return;
    }

    if (this.tiltEnabled && this.tiltCalibrated) {
      this.move.copy(this.tiltMove);
      return;
    }

    this.move.set(0, 0);
  }

  consumeLookDelta() {
    const result = this.lookDelta.clone();
    this.lookDelta.set(0, 0);
    return result;
  }

  consumeJump() {
    const result = this.jumpPressed;
    this.jumpPressed = false;
    return result;
  }
}
