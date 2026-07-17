/*
  input.js
  只负责“读取输入”，不负责移动角色。

  左半屏：
  手指按下后出现动态摇杆，滑动控制移动。

  右半屏：
  滑动控制镜头方向。
*/

import * as THREE from "three";

export class InputController {
  constructor() {
    this.move = new THREE.Vector2();
    this.lookDelta = new THREE.Vector2();
    this.jumpPressed = false;

    this.movePointerId = null;
    this.lookPointerId = null;

    this.moveZone = document.getElementById("moveZone");
    this.lookZone = document.getElementById("lookZone");
    this.joystickBase = document.getElementById("joystickBase");
    this.joystickKnob = document.getElementById("joystickKnob");
    this.jumpButton = document.getElementById("jumpButton");

    this.joystickCenter = new THREE.Vector2();
    this.lastLookPosition = new THREE.Vector2();
    this.joystickRadius = 54;

    this.bindTouch();
    this.bindKeyboard();
  }

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
      this.move.set(0, 0);
      this.joystickBase.style.display = "none";
      this.joystickKnob.style.transform = "translate(-50%, -50%)";
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
      this.move.set(0, 0);
    } else {
      this.move.set(
        knobX / this.joystickRadius,
        -knobY / this.joystickRadius
      );
    }
  }

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
    if (this.movePointerId !== null) return;

    let x = 0;
    let y = 0;

    if (pressed.has("KeyA") || pressed.has("ArrowLeft")) x -= 1;
    if (pressed.has("KeyD") || pressed.has("ArrowRight")) x += 1;
    if (pressed.has("KeyW") || pressed.has("ArrowUp")) y += 1;
    if (pressed.has("KeyS") || pressed.has("ArrowDown")) y -= 1;

    this.move.set(x, y);

    // 防止斜着走比直走更快。
    if (this.move.lengthSq() > 1) {
      this.move.normalize();
    }
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
