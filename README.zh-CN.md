# PatchOath

**给 AI 改代码划清边界，再用证据检查它是否越界。**

[English](README.md) · [入门指南](docs/getting-started.md) · [问题反馈](https://github.com/feifeing/PatchOath/issues)

你只让编程助手改一个按钮，它却顺手改了鉴权、路由和依赖。页面能打开，并不能回答这些修改是否得到了你的授权。

PatchOath 是本地运行的命令行工具和审查界面：先声明允许修改的路径与规模，再记录 Git 中实际发生的变化，把越界原因、影响范围和可核验的证据放在一起供人审查。核心流程不需要模型或云账户。

![PatchOath 审查界面：示例检查点、修改边界、文件变化与证据](docs/patchoath-dashboard.webp)

这是实际界面中的**内置示例数据**。检查自己的项目时，命令行工具会生成包含实际记录证据的本地报告。

## 先体验界面

需要 Node.js 20+、npm 和 Git：

```bash
git clone https://github.com/feifeing/PatchOath.git
cd PatchOath
npm ci
npm run dev
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)，切换检查点，查看修改约定、文件变化与审查证据。开发预览只展示内置示例，不会自动扫描你的项目。

项目当前为开源 alpha，包仍设为 `private: true`，请从源码安装。

## 检查自己项目中的一次修改

在刚克隆的 PatchOath 目录里运行：

```bash
npm link
```

进入你要检查的 Git 项目，**在 AI 开始修改前**运行以下命令；路径和数量上限应按实际项目调整：

```bash
patchoath init
patchoath checkpoint --prompt "修改主按钮颜色" --allow "src/components/**,src/styles/**" --deny "src/auth/**,src/router/**" --max-files 3 --max-lines 80
```

让 AI 修改后，查看并记录结果：

```bash
patchoath diff
patchoath checkpoint --finish
patchoath verify
patchoath report --open
```

报告可直接在本地打开，无需运行网页服务器。创建检查点不会移动 `HEAD` 或替换真实 Git 暂存区。重命名同时检查源路径和目标路径；把鉴权文件移到 UI 目录仍会触及原有边界。

## 能帮你看清什么

| 功能                               | 回答的问题                                                   |
| ---------------------------------- | ------------------------------------------------------------ |
| 修改约定（Change Contract）        | 你明确允许哪些路径、敏感范围和修改规模？                     |
| 授权偏移（Authorization Drift）    | 实际修改是否超出这些规则？                                   |
| 影响范围（Blast Radius）           | 改动扩散到哪里，哪些具体因素值得审查？                       |
| 可选视觉证据                       | 截图、基础布局和 DOM 指纹发生了什么变化？                    |
| 证据回执（Evidence Receipt）       | 现有证据是否仍与记录时的摘要一致？                           |
| 证据关系自检（Trust Graph Doctor） | 会话、检查点、回执、Git 引用、审查记录和胶囊是否仍相互一致？ |
| 历史审查记录                       | 人对这一次已经发生的修改记录了什么结论？                     |
| 证据胶囊（Evidence Capsule）       | 可以按明确规则披露哪些较小范围的证据？                       |
| 受保护的恢复                       | 能否回到记录前的状态，同时避免覆盖后续修改？                 |

## 使用边界

可以运行 `patchoath doctor` 做**只读自检**；`patchoath doctor --json` 将诊断对象写到标准输出。退出码 `0` 表示没有失败项（仍可能有警告），`1` 表示命令未能完成，`2` 表示发现证据规则不一致。未初始化且有可检查提交的仓库只产生警告；自检不会初始化仓库或自动修复证据。详见 [Trust Graph Doctor](docs/trust-graph-doctor.md)。

- 提示词表达意图，**不会自动授予修改权限**；路径和数量约束来自你声明的修改约定。
- 人工接受某次历史修改，**不会给 AI 下一次修改自动授权**。填写审查者名称也不等于身份认证。
- 证据校验检查一致性，不证明代码正确、安全或作者身份。风险分数是带具体理由的审查提示；视觉差异也不等于功能错误。
- 完整本地报告可能包含提示词、路径和截图。`patchoath capsule --json` 默认省略提示词全文、变更路径、完整规则、补丁和截图字节；分享前仍需检查内容。
- `patchoath restore` 先预览；只有显式添加 `--apply` 才执行，并检查检查点之后的工作区变化。
- 子模块记录的是提交指针。子模块内部未提交的改动需要先提交或丢弃，父仓库检查点才能继续捕获。
- Git 忽略文件的内容不在捕获范围内。覆盖信息只记录忽略根路径的数量和路径集合摘要，不保存这些路径名或内容，当前回执也不绑定这项元数据。它说明捕获资格策略；分开查看暂存或未暂存改动时，不代表所有符合资格的文件都出现在该次差异里。

更详细的安装、视觉捕获和常见问题见 [Getting started](docs/getting-started.md)。设计、证据格式和兼容性说明见 [英文 README](README.md)。

## 一起完善

欢迎提交 Git 边界情况、界面可访问性问题和更清楚的审查说明。请先阅读 [贡献指南](CONTRIBUTING.md)；报告安全漏洞请使用 [安全政策](SECURITY.md)中的私密报告渠道。

如果它能帮你审查 AI 修改，欢迎在 [GitHub 项目页](https://github.com/feifeing/PatchOath)点一颗 Star，让更多开发者发现它。

源码采用 [MIT License](LICENSE)。
