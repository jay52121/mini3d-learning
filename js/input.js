/*
  input.js
  只负责“读取输入”，不负责移动角色。

  左半屏：
  手指按下后出现动态摇杆，滑动控制移动。

  右半屏：
  滑动控制镜头方向。

  iPad 重力感应：
  玩家点击“开启感应”后，可以倾斜 iPad 控制移动。

  三种移动输入的优先级：

  触屏摇杆
  ↓
  键盘
  ↓
  重力感应

  所以开启感应后，手指按住左半屏时，
  摇杆仍然可以临时接管移动。
*/

import * as THREE from "three";

export class InputController {
  constructor() {
    /*
      move 是玩家类最终读取的移动方向。

      x：左右
      y：前后
    */
    this.move = new THREE.Vector2();

    /*
      不同输入先分别保存，
      最后由 refreshMove() 选择其中一种。
    */
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

    /*
      ============================================================
      重力感应参数
      ============================================================
    */

    this.tiltEnabled = false;
    this.tiltCalibrated = false;
    this.waitingForCalibration = false;
    this.orientationListenerAdded = false;

    /*
      开启感应时，把当时的姿势记为“零点”。

      玩家不需要把 iPad 放平，
      用自己平时最舒服的握持姿势点击开启即可。
    */
    this.tiltZero = new THREE.Vector2();

    /*
      传感器数据会有一点小抖动，
      filteredTilt 用来保存平滑后的结果。
    */
    this.filteredTilt = new THREE.Vector2();

    /*
      deadZone：死区。
      轻微手抖小于这个值时，角色完全不动。

      maxTilt：达到满速度需要倾斜多少。

      这里使用的是重力在屏幕平面上的比例，
      不是直接使用角度。
    */
    this.tiltDeadZone = 0.035;
    this.tiltMax = 0.26;

    /*
      每次传感器更新时，
      新结果只占 18%，旧结果保留 82%。

      数字越小越稳，
      但反应也会稍慢。
    */
    this.tiltSmoothing = 0.18;

    this.handleOrientation =
      this.handleOrientation.bind(this);

    this.bindTouch();
    this.bindKeyboard();
    this.bindTiltControls();
  }

  /*
    ============================================================
    触屏控制
    ============================================================
  */

  bindTouch() {
    this.moveZone.addEventListener("pointerdown", (event) => {
      if (this.movePointerId !== null) return;

      this.movePointerId = event.pointerId;
      this.moveZone.setPointerCapture(event.pointerId);

      this.joystickCenter.set(event.clientX, event.clientY);
      this.joystickBase.style.left = `${event.clientX}px`;
      this.joystickBase.style.top = `${event.clientY}px`;
      this.joystickBase.style.display = "block";

      this.updateJoystick(event.clientX, event.clientY);
    });

    this.moveZone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.movePointerId) return;
      this.updateJoystick(event.clientX, event.clientY);
    });

    const stopMove = (event) => {
      if (event.pointerId !== this.movePointerId) return;

      this.movePointerId = null;
      this.joystickMove.set(0, 0);
      this.joystickBase.style.display = "none";
      this.joystickKnob.style.transform = "translate(-50%, -50%)";

      /*
        松开摇杆以后，
        如果重力感应开着，就会自动重新接管。
      */
      this.refreshMove();
    };

    this.moveZone.addEventListener("pointerup", stopMove);
    this.moveZone.addEventListener("pointercancel", stopMove);

    this.lookZone.addEventListener("pointerdown", (event) => {
      if (this.lookPointerId !== null) return;

      this.lookPointerId = event.pointerId;
      this.lookZone.setPointerCapture(event.pointerId);
      this.lastLookPosition.set(event.clientX, event.clientY);
    });

    this.lookZone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.lookPointerId) return;

      this.lookDelta.x += event.clientX - this.lastLookPosition.x;
      this.lookDelta.y += event.clientY - this.lastLookPosition.y;
      this.lastLookPosition.set(event.clientX, event.clientY);
    });

    const stopLook = (event) => {
      if (event.pointerId === this.lookPointerId) {
        this.lookPointerId = null;
      }
    };

    this.lookZone.addEventListener("pointerup", stopLook);
    this.lookZone.addEventListener("pointercancel", stopLook);

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

  /*
    ============================================================
    键盘控制
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

    // 防止斜着走比直走更快。
    if (this.keyboardMove.lengthSq() > 1) {
      this.keyboardMove.normalize();
    }

    this.refreshMove();
  }

  /*
    ============================================================
    iPad 重力感应
    ============================================================
  */

  bindTiltControls() {
    this.tiltButton.addEventListener("pointerdown", async (event) => {
      event.preventDefault();

      if (this.tiltEnabled) {
        this.requestTiltCalibration();
      } else {
        await this.enableTilt();
      }
    });

    this.tiltOffButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.disableTilt();
    });

    /*
      iPad 横屏方向发生变化后，
      传感器的 X、Y 对应关系也会改变。

      所以转屏以后自动重新校准一次。
    */
    const recalibrateAfterRotation = () => {
      if (this.tiltEnabled) {
        this.requestTiltCalibration("转屏后请保持姿势");
      }
    };

    if (screen.orientation?.addEventListener) {
      screen.orientation.addEventListener(
        "change",
        recalibrateAfterRotation
      );
    } else {
      window.addEventListener(
        "orientationchange",
        recalibrateAfterRotation
      );
    }
  }

  async enableTilt() {
    if (typeof DeviceOrientationEvent === "undefined") {
      this.setTiltStatus("此设备不支持");
      return;
    }

    try {
      /*
        iPhone 和 iPad Safari 要求：

        requestPermission() 必须直接由按钮点击触发。

        不能在网页打开时自动请求，
        否则浏览器会拒绝。
      */
      if (
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        const permission =
          await DeviceOrientationEvent.requestPermission();

        if (permission !== "granted") {
          this.setTiltStatus("权限未允许");
          return;
        }
      }

      if (!this.orientationListenerAdded) {
        window.addEventListener(
          "deviceorientation",
          this.handleOrientation,
          true
        );

        this.orientationListenerAdded = true;
      }

      this.tiltEnabled = true;
      this.tiltButton.textContent = "重新校准";
      this.tiltOffButton.hidden = false;

      this.requestTiltCalibration("保持当前姿势");
    } catch (error) {
      console.error("无法开启重力感应：", error);
      this.setTiltStatus("开启失败");
    }
  }

  disableTilt() {
    this.tiltEnabled = false;
    this.tiltCalibrated = false;
    this.waitingForCalibration = false;

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

    /*
      某些设备可能暂时不给出其中一个角度。
      遇到 null 时不要进行计算。
    */
    if (event.beta === null || event.gamma === null) {
      this.setTiltStatus("等待传感器");
      return;
    }

    const screenTilt = this.getScreenTilt(
      event.beta,
      event.gamma
    );

    /*
      开启或重新校准后，
      第一份有效数据就是新的零点。
    */
    if (this.waitingForCalibration || !this.tiltCalibrated) {
      this.tiltZero.copy(screenTilt);
      this.filteredTilt.set(0, 0);
      this.tiltMove.set(0, 0);

      this.waitingForCalibration = false;
      this.tiltCalibrated = true;

      this.setTiltStatus("已开启");
      this.refreshMove();
      return;
    }

    const difference = screenTilt.sub(this.tiltZero);

    /*
      左右倾斜控制 move.x。

      前后倾斜控制 move.y。
      Y 前面的负号让“把 iPad 上沿稍微压低”表示向前。
    */
    const target = new THREE.Vector2(
      this.applyTiltDeadZone(difference.x),
      this.applyTiltDeadZone(-difference.y)
    );

    /*
      lerp 是线性插值。

      它不会立刻跳到新值，
      而是慢慢靠近，所以画面更稳。
    */
    this.filteredTilt.lerp(
      target,
      this.tiltSmoothing
    );

    this.tiltMove.copy(this.filteredTilt);

    /*
      斜着倾斜时长度可能超过 1，
      所以同样要限制最大值。
    */
    if (this.tiltMove.lengthSq() > 1) {
      this.tiltMove.normalize();
    }

    this.refreshMove();
  }

  getScreenTilt(betaDegrees, gammaDegrees) {
    /*
      beta 和 gamma 是设备自身坐标里的角度。

      iPad 转成横屏后，
      设备坐标并不会自动跟着网页转。

      所以先计算重力在设备屏幕平面上的投影，
      再按照当前横竖屏方向旋转到“玩家看到的屏幕坐标”。
    */

    const beta = THREE.MathUtils.degToRad(betaDegrees);
    const gamma = THREE.MathUtils.degToRad(gammaDegrees);

    const deviceX = Math.sin(gamma) * Math.cos(beta);
    const deviceY = Math.sin(beta);

    const angle = this.getScreenAngle();

    if (angle === 90) {
      return new THREE.Vector2(
        deviceY,
        -deviceX
      );
    }

    if (angle === 270) {
      return new THREE.Vector2(
        -deviceY,
        deviceX
      );
    }

    if (angle === 180) {
      return new THREE.Vector2(
        -deviceX,
        -deviceY
      );
    }

    return new THREE.Vector2(
      deviceX,
      deviceY
    );
  }

  getScreenAngle() {
    let angle = 0;

    if (
      screen.orientation &&
      typeof screen.orientation.angle === "number"
    ) {
      angle = screen.orientation.angle;
    } else if (typeof window.orientation === "number") {
      /*
        window.orientation 已经是旧接口，
        但较老的 iPad Safari 仍可能只提供它。
      */
      angle = window.orientation;
    }

    /*
      把 -90 转换为 270，
      最终只保留 0、90、180、270。
    */
    return ((angle % 360) + 360) % 360;
  }

  applyTiltDeadZone(value) {
    const amount = Math.abs(value);

    if (amount <= this.tiltDeadZone) {
      return 0;
    }

    const usableRange =
      this.tiltMax - this.tiltDeadZone;

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
    选择最终移动输入
    ============================================================
  */

  refreshMove() {
    /*
      1. 手指正按住摇杆：摇杆优先。
    */
    if (this.movePointerId !== null) {
      this.move.copy(this.joystickMove);
      return;
    }

    /*
      2. 键盘有输入：键盘优先于感应。
    */
    if (this.keyboardMove.lengthSq() > 0) {
      this.move.copy(this.keyboardMove);
      return;
    }

    /*
      3. 感应已经开启并校准：使用倾斜方向。
    */
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
