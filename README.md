# N1 历年研习室 · 在线版

2010—2026 年 32 场 JLPT N1 研习资料，支持做题、听力片段定位、逐题讲解、知识专题、考点精编、成绩统计和练习记录。

- 在线使用：https://Subterranean-Sun.github.io/n1-study/
- 听力资源：https://Subterranean-Sun.github.io/n1-audio/
- 原始资料与答案：[完整归档](https://github.com/Subterranean-Sun/n1-archive/releases/tag/v2026-11-19)
- 部署与恢复：[完整快照](https://github.com/Subterranean-Sun/n1-archive/releases/tag/snapshot-2026-11-19)

手机可横向滑动主栏目导航。题目和讲解可以直接互相跳转。练习和阅读记录保存在当前浏览器，通过站内 JSON 导入/导出转移；目前没有账号或自动云同步。

本仓库来自原离线版的独立副本。原目录未改动。在线版调整音频 HTTPS 路径、手机导航和原件下载链接，保留题号、答案、解析和旧锚点。维护工具包与本地备份不参与发布。

## 日常更新

修改这个独立在线副本后，提交并推送 main 分支，GitHub Actions 会自动发布新版本。Pages 设置采用 GitHub Actions；.nojekyll 保留，网站直接运行原生 HTML/CSS/JavaScript。

手动运行 Pages 工作流时，restore_snapshot 默认为 false，会发布当前 main。只有明确需要恢复最初的完整快照时才勾选它；恢复会替换当前站点内容。

已发布内容保存在 Git 仓库与 Pages，原件和恢复快照保存在 Releases。Actions 的 Pages artifact 只用于传输：成功部署后自动删除，未成功的传输包保留一天。

新增场次时，将录音放入音频仓库，并在 data/YYYY_MM.js 的 audio.path 填写对应 HTTPS 地址。发布体积须保持在 1 GB 以下；当前主站约 719 MB。

资料来源与校订依据见站内“校订与来源”。本项目不附加对第三方试题、录音或其他原始资料的权利许可。
