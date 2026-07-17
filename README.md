# Mini3D Learning v0.1

面向 iPad 与初学者的 3D 平台游戏学习项目。

## 在线试玩

启用 GitHub Pages 后访问：

`https://jay52121.github.io/mini3d-learning/`

## 已实现

- 第一人称、第二人称、第三人称切换
- 左半屏动态摇杆
- 右半屏滑动转镜头
- 跳跃
- 平台和灰墙碰撞
- 锥形尖刺
- 太阳光、环境光、阴影和雾
- 面向初学者的中文注释

## 代码结构

- `index.html`：网页入口
- `css/style.css`：触屏界面
- `js/input.js`：摇杆、滑动和键盘输入
- `js/player.js`：角色移动、跳跃与碰撞
- `js/camera-controller.js`：三种镜头
- `js/level.js`：平台、灰墙、尖刺和光照
- `js/config.js`：集中保存手感参数
- `js/main.js`：组装游戏并运行主循环

## 关于第二人称

“第二人称镜头”并没有统一的游戏行业标准。本项目把它设计成位于角色前方、持续看着角色的电影机位。
