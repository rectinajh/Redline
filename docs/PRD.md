# Redline Receipt 产品需求文档

版本：PRD v1.0
状态：Hackathon MVP
目标 bounty：Bounty 1 — Interoperable Asset Products
目标网络：Coston2，Chain ID 114

## 1. 产品定义

Redline Receipt 是一个交易前决策护栏。用户准备进行一笔高风险 swap 时，先提交自己的最大仓位、最低输出和有效期；产品通过确定性检查和 AI Risk Brief 解释交易风险；用户仍由自己的钱包签名；交易完成后，Flare/FDC 验证外部链事实，并返回是否遵守了用户自己的红线。

核心句：

> Redline 不是预测涨跌的 AI 交易机器人，而是在签名前让风险变得难以自欺、在交易后证明用户是否遵守了自己的规则。

## 2. 用户与问题

### 目标用户

- 使用 DEX 进行高波动资产 swap 的 DeFi 用户
- 知道自己容易冲动追单、加仓或忽略滑点的交易者
- 不希望把签名权交给自动交易 bot，但希望交易前有一层纪律护栏
- 需要向自己或团队复盘“当时承诺了什么、实际做了什么”的用户

### 用户问题

现有钱包 warning 通常在签名前提醒风险，但无法表达用户自己的规则，也不会在交易后用外部链事实证明用户是否遵守了自己的承诺。普通模拟器能告诉用户交易可能发生什么，却不能把“我愿意承受的边界”绑定到后续真实交易。

### 现有替代方案的不足

- 关闭页面或忽略钱包 warning
- 手写交易计划，但计划不绑定真实交易
- 普通 simulation dashboard，缺少用户承诺和事后证明
- 自动 bot 或 policy wallet，把执行权交给系统

## 3. 产品目标

### 黑客松目标

在一天级别的开发窗口中，完成一个可提交、可部署、可复核的 Flare mini app：

1. 用户在 10 秒内理解“先画线，后交易，Flare 裁决”。
2. 一条真实 Coston2/FDC 路径跑通。
3. 两条 replay 路径稳定展示 `LINE HELD` 和 `LINE CROSSED`。
4. Public Receipt 脱离钱包也可打开并复核证据。
5. README、GitHub、技术材料、合约地址和演示视频可以组成完整提交包。

### 非目标

- 预测价格或给出买卖建议
- 自动执行、托管资产、保存私钥
- 把 AI 当作安全裁判
- 支持所有链、所有 router 或所有钱包
- 构建完整交易安全情报平台
- 使用 FCC 完成本次 MVP

## 4. 核心机制

```text
Draw the line
      ↓
See the risk
      ↓
Sign the Receipt
      ↓
Make the trade
      ↓
Let Flare judge
      ↓
Keep the record
```

### 用户承诺

最小 Receipt 必须绑定：

```text
trader
chainId
router
tokenIn
tokenOut
maxInput
minOutput
maxPositionBps
expiry
simulationHash
riskAssessmentHash
threatIntelSnapshotHash
nonce
```

字段是否全部进入合约，以最终验证的 FDC proof 字段和 gas 预算为准；不能进入合约的长文本只保存 hash，Public Receipt 显示最小化摘要。

## 5. 用户流程

### 5.1 选择红线

用户选择一个 preset：

- `Probe Position`：单笔最多使用钱包资产的 1%
- `No Unknown Router`：未知 router 进入 `BLOCKED`
- `Cooling-Off Trade`：高风险结果要求用户等待或重新确认

用户可以编辑金额、最低输出和 expiry。所有金额使用整数最小单位，不使用浮点。

### 5.2 查看安全摘要

页面展示：

- 交易摘要：tokenIn、tokenOut、router、chainId
- 仓位和最低输出
- 确定性检查：路由、pair、授权、滑点、模拟、资产变化
- Threat Intel：source、retrievedAt、expiresAt、confidence
- AI Risk Brief：风险原因、风险等级、AI 状态
- 数据真实性：`LIVE`、`FIXTURE`、`MOCK`、`UNVERIFIED`

AI Risk Brief 的固定文案边界：

> AI 解释风险，但不决定交易是否安全。Redline 不会替你签名或执行交易。

### 5.3 签署 Receipt

签名前展示完整 commitment 摘要和 signing boundary：

> Redline cannot sign or execute this trade. Your wallet remains in control.

确定性 `BLOCKED` 时，按钮不可继续；AI `HIGH` 不能独立产生链上 `BLOCKED`。

### 5.4 交易与 proof

Receipt 和交易状态显式展示：

```text
DRAFT
SIGNED
TRADE_SUBMITTED
PROOF_REQUESTED
PROOF_FINALIZED
VERIFIED
```

异常状态：

```text
PROOF_PENDING
PROOF_TIMEOUT
PROOF_INVALID
EXPIRED
MISMATCHED
REPLAYED
UNVERIFIED
```

### 5.5 Accountability Card

交易后显示承诺与事实对照：

| 承诺 | 真实事实 | 结果 |
|---|---|---|
| 最大输入 1% | 实际 0.8% | 通过 |
| 最低输出 100 USDC | 实际输出 102 USDC | 通过 |
| 允许 Router | Router 匹配 | 通过 |
| 最终状态 | FDC verified | `LINE HELD` |

越线时列出具体原因，例如实际金额超过 `maxInput`、实际输出低于 `minOutput`、router 不匹配或 Receipt 过期。

### 5.6 Public Receipt

`/receipt/:id` 是只读、可分享的复核页，默认最小化公开字段：

- Receipt ID
- 截断地址或地址 hash
- chainId、交易哈希、合约地址
- Receipt commitments 摘要
- Risk Capsule hash、来源和 freshness
- FDC 状态和最终 Verdict
- live/fixture/mock/unverified 标签

不公开完整私密理由、AI 原始 prompt、完整余额、历史交易和不必要的资产组合。

## 6. 安全与信任原则

1. 钱包始终由用户控制。
2. AI 只能解释，不能生成交易事实、修改 Receipt 或决定最终 Verdict。
3. 缺少 proof、AI 不可用、威胁情报过期都不能变成 `SAFE` 或 `LINE HELD`。
4. 只有 Flare 合约写入的验证状态才是最终结果。
5. live、fixture、mock 和 unverified 必须在每个证据卡片上显式标记。
6. Receipt 使用不可枚举 ID、chainId、nonce、expiry 和 consumed 防重放。
7. 合约 MVP 不可升级；配置变更通过新合约地址完成。

## 7. 评审价值映射

| 评审标准 | Redline 证据 |
|---|---|
| 产品有用性 | 解决冲动交易和自我纪律问题，不要求用户交出执行权 |
| Flare 集成质量 | FDC 验证外部交易事实，链上合约产生最终 held/crossed |
| 技术执行 | Receipt commitment、proof 状态机、replay protection、schema 和错误处理 |
| 新工作量 | Risk Capsule、Public Receipt、Redline Presets、Demo Replay、Accountability Card |
| 清晰度 | 一个核心机制：用户先画线，Flare 判断是否守线 |
| 未来潜力 | Evidence Adapter/Receipt v1 可扩展更多外部链和资产 |

## 8. 验收标准

### P0

- [x] Coston2 合约地址和 explorer 链接真实可打开
- [x] 一条真实 FDC path 已从 request 跑至 on-chain verification
- [x] `LINE HELD` 已由链上验证事实产生：[verdict tx](https://coston2-explorer.flare.network/tx/0xdafac332ea09369949906ae4ae14227d46d9469460e43972f30c7b345f3641e2)
- [ ] `LINE CROSSED` 能指出具体越线原因
- [ ] proof 无效时显示 `UNVERIFIED`
- [ ] AI malformed/timeout 不影响确定性检查，不产生 `LINE HELD`
- [ ] Demo Replay 清晰标记 `FIXTURE`
- [ ] Public Receipt 不需要钱包即可读取
- [ ] 最终提交没有 localhost 和未标注 mock fallback

### P1

- [ ] 3 个 Redline Presets
- [ ] Accountability Card
- [ ] 390px 窄屏可读
- [ ] retry、refresh、duplicate request 有幂等行为
- [ ] 结构化日志可以用 receiptId 重建一次成功和一次失败流程

## 9. Demo 脚本

开场：

> “Redline 不告诉你买不买。它先让你写下自己愿意承担什么，然后让 Flare 在交易后判断你有没有守住这条线。”

过程：

1. 选择 `Probe Position`。
2. 看到三条限制和 Risk Capsule。
3. 强调 AI 只是解释层。
4. 签署 Receipt，强调钱包仍由用户控制。
5. 展示 FDC proof 状态。
6. 展示 `LINE HELD`。
7. 重放越线 fixture，展示 `LINE CROSSED`。
8. 打开 Public Receipt，说明评审可以独立复核。

收尾：

> “AI 让风险变得可读，Flare 让承诺是否兑现变得可验证。”

## 10. 提交信息模板

```text
项目名：Redline Receipt
选择的 bounty：Bounty 1 — Interoperable Asset Products
产品简介：交易前把用户自己的风险边界写成 Receipt，交易后通过 Flare/FDC 验证是否守线。
目标用户：进行高风险 DeFi swap、希望控制冲动交易但不想交出钱包控制权的用户。
Demo/App：TBD
Video：TBD
GitHub：https://github.com/rectinajh/Redline
技术材料：README.md / docs/PRD.md / docs/TECHNICAL.md
如何使用 Flare：FDC 验证外部 EVM 交易事实，Coston2 Receipt 合约写入最终 verdict。
本次新做了什么：Receipt commitment、Risk Capsule、security summary、FDC adapter、held/crossed、replay protection、Public Receipt、Presets、Replay、Accountability Card。
合约地址：FDC adapter [`0x0aeA880F18232fE82EdA800a874F5CbE99dd5693`](https://coston2-explorer.flare.network/address/0x0aeA880F18232fE82EdA800a874F5CbE99dd5693)；Redline Receipt [`0x01Dd46c45c7d5fC805B93CD331d6FaA60C735B74`](https://coston2-explorer.flare.network/address/0x01Dd46c45c7d5fC805B93CD331d6FaA60C735B74)
短期 roadmap：更多 FDC 可验证事实来源和资产适配器；之后再评估 FCC 私密计算。
```
