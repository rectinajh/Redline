# Redline Receipt

> **Draw the line. Make the trade. Let Flare judge.**

Redline Receipt 是一个交易前决策护栏：用户先写下自己愿意遵守的交易限制，查看确定性安全检查和可解释的 AI Risk Brief，再由自己的钱包签署交易。交易完成后，Flare 通过 FDC 验证外部链交易事实，并把结果写成 `LINE HELD` 或 `LINE CROSSED`。

Redline 不预测涨跌，不替用户签名，不托管资产，也不自动执行交易。AI 负责解释风险，Flare 负责验证事实。

> 当前状态：**真实 FDC end-to-end 已完成**：Sepolia swap 的 FDC proof 已由 Coston2 Receipt 合约消费，写入 `LINE HELD`。公开 App 和视频链接仍待发布。

## Run locally

```bash
npm start
# open http://localhost:4173

npm test
forge test

# fill .env locally first; it is ignored by Git
node scripts/fdc/prepare-request.mjs <sepolia-tx-hash>
node scripts/fdc/submit-request.mjs <abi-encoded-request>

# Only replace proof.json after the DA Layer has actually returned a proof.
# A missing attestation keeps the old file intact and exits non-zero.
PROOF_TMP=$(mktemp)
node scripts/fdc/get-proof.mjs <voting-round-id> <abi-encoded-request> > "$PROOF_TMP" \
  && mv "$PROOF_TMP" proof.json \
  || { rm -f "$PROOF_TMP"; echo "Proof not ready — retry the same round and request bytes."; }
node scripts/fdc/pack-proof.mjs proof.json

# Or keep the raw proof off disk and pipe it directly to the packer.
node scripts/fdc/get-proof.mjs <voting-round-id> <abi-encoded-request> \
  | node scripts/fdc/pack-proof.mjs -

# If the testnet fee configuration is not being picked up, use the official
# one-C2FLR development fee for one retry:
FDC_REQUEST_FEE=1ether node --env-file=.env scripts/fdc/submit-request.mjs <abi-encoded-request>

# Broadcasts the FDC adapter and Redline Receipt to Coston2. It reads
# the deployment defaults from .env and prints explorer-ready addresses.
npm run deploy:coston2

# After deployment, create the fixed 0.001 ETH / 30 USDC demo Receipt.
npm run receipt:submit -- <redline-receipt-address>

# After FDC proof is available and packed.
npm run receipt:verify -- <redline-receipt-address> <receipt-id> <packed-proof>
```

当前可运行内容：

- Risk Capsule 和确定性安全检查
- `Probe Position`、`No Unknown Router`、`Cooling-Off Trade` presets
- Demo wallet / injected wallet 连接入口
- Decision Receipt 签名入口
- `LINE HELD` / `LINE CROSSED` Demo Replay
- `LIVE FDC` fail-closed 的 `UNVERIFIED` 状态
- `FdcEvmTransactionVerifier`：Coston2 `FdcVerification` 的受控 EVMTransaction adapter
- `/receipt/:id` wallet-free Public Receipt
- Solidity Receipt v1 合约骨架和 Foundry 测试

## Hackathon submission

| 项目 | 内容 |
|---|---|
| 项目名 | Redline Receipt |
| 选择的 bounty | Bounty 1 — Interoperable Asset Products |
| 网络 | Coston2，Chain ID 114 |
| Flare 原语 | FDC；FTSO 仅在价格阈值确实需要时启用 |
| 目标用户 | 想在高风险 DeFi swap 前控制冲动交易的用户 |
| Demo App | `TBD — 部署后替换；本地开发为 http://localhost:4173` |
| Demo Video | `TBD — 提交前替换` |
| GitHub | `https://github.com/rectinajh/Redline` |
| FDC adapter | [`0x0aeA…5693`](https://coston2-explorer.flare.network/address/0x0aeA880F18232fE82EdA800a874F5CbE99dd5693) |
| Receipt 合约 | [`0x01Dd…5B74`](https://coston2-explorer.flare.network/address/0x01Dd46c45c7d5fC805B93CD331d6FaA60C735B74) |
| 部署交易 | [adapter](https://coston2-explorer.flare.network/tx/0x6d580b2467d81d87195783a7fcbea40392f3e1e769f6e80b3243d85d611390e1) · [receipt](https://coston2-explorer.flare.network/tx/0x280699f42164faf3636326b57e445367d41948102a8e025b95247aab25999dcf) |
| Live FDC verdict | [`LINE HELD`](https://coston2-explorer.flare.network/tx/0xdafac332ea09369949906ae4ae14227d46d9469460e43972f30c7b345f3641e2) · [Sepolia source tx](https://sepolia.etherscan.io/tx/0xf85d179a409f364e3bfea157155484cec869f7b61df81784b60cdab84eb1dcb4) |

## The one clear mechanic

```text
选择红线 → 查看风险 → 签署 Receipt → 完成交易 → Flare 验证是否守线
```

用户先提交三类限制：

1. 最大输入金额或最大仓位比例
2. 最低输出金额或最大可接受亏损
3. 交易有效期和失效条件

如果链上验证的真实交易满足承诺，显示：

```text
LINE HELD
```

如果交易违反承诺，显示：

```text
LINE CROSSED
```

如果 proof 无法验证，显示：

```text
UNVERIFIED
```

不会把未知事实伪装成安全。

## 为什么 Flare 是产品体验的一部分

Redline 不是把交易哈希放进普通仪表盘。产品的核心体验依赖 Flare：

1. 用户在交易前签署带有自己限制的 Decision Receipt。
2. 外部 EVM swap 完成后，应用通过 FDC 请求并验证外部链交易事实。
3. Flare 上的 Receipt 合约检查 proof、chainId、router、资产、金额、expiry、nonce 和 replay protection。
4. Public Receipt 读取链上最终状态，展示 `LINE HELD`、`LINE CROSSED` 或 `UNVERIFIED`。

当前 canonical FDC path 已锁定为：**Coston2 Receipt + Sepolia 外部 EVM transaction + `EVMTransaction` + sourceId `testETH`**。官方文档列出的 request body 为 `transactionHash`、`requiredConfirmations`、`provideInput`、`listEvents` 和 `logIndices`。Round finalization 和 DA Layer proof 仍需使用真实交易完成 smoke test；在完成前不把 proof 状态写成已验证事实。

当前 live adapter 的最小支持形状是：Sepolia 原生 ETH → 一个 ERC-20 输出，输出 Transfer 的接收方必须是原交易 source address；router 取 EVMTransaction 的 receivingAddress。其余交易形状会保持 `UNVERIFIED`。

参考：[FDC EVMTransaction guide](https://dev.flare.network/fdc/guides/hardhat/evm-transaction)、[FDC getting started](https://dev.flare.network/fdc/getting-started)、[IEVMTransaction](https://dev.flare.network/fdc/reference/IEVMTransaction)。

## Risk Capsule 与安全提示

Risk Capsule 是交易前的风险证据摘要，不是安全保证。它包含：

- router、pair、网络和资产变化检查
- 模拟结果、滑点和授权检查
- 单一可复核的威胁情报来源、时间戳和新鲜度
- AI Risk Brief、AI 状态和解释
- `riskAssessmentHash`、`threatIntelSnapshotHash`、`simulationHash`

安全状态：

```text
OK / CAUTION / BLOCKED / UNKNOWN / STALE
```

重要边界：

- AI 只能解释风险，不能修改交易事实、Receipt 字段或最终 Verdict。
- AI 超时、拒答、错误 JSON 或威胁情报过期时，显示 `AI UNAVAILABLE`、`AI INVALID`、`AI REFUSED` 或 `STALE`。
- 只有确定性规则可以在交易前阻止签名流程。
- 只有 Flare 上已验证的事实可以产生最终 `LINE HELD` 或 `LINE CROSSED`。
- Redline 不能签名或执行交易，用户钱包始终由用户控制。

## 60–90 秒 Demo

1. 选择 `Probe Position` preset，限制单笔仓位为 1%。
2. 修改最低输出和 Receipt expiry。
3. 查看 Risk Capsule：路由、滑点、授权、模拟和威胁情报来源。
4. 展示 AI 解释：“风险高的原因是什么”，并强调 AI 不是最终裁判。
5. 用户连接钱包并签署 Decision Receipt。
6. 提交一笔固定的外部 EVM swap，或打开明确标记为 `FIXTURE` 的 Demo Replay。
7. 展示 FDC 状态：`PROOF_REQUESTED → PROOF_FINALIZED → VERIFIED`。
8. 展示 Accountability Card：用户承诺与真实交易事实逐项对比。
9. 展示 `LINE HELD`；再一键重放超出金额/最低输出的场景，展示 `LINE CROSSED`。
10. 打开 Public Receipt，展示 proof、hash、交易哈希和 `LIVE/FIXTURE/UNVERIFIED` 标签。

## 文档

- [产品需求文档](docs/PRD.md)
- [技术开发文档](docs/TECHNICAL.md)
- CEO Review 计划：`~/.gstack/projects/rectinajh-Redline/ceo-plans/2026-08-14-redline-receipt.md`

## MVP 范围

本次只实现：

- Coston2
- 一个已验证的外部 EVM source
- 一个 router
- 一个交易对
- 一个 live FDC path
- 两条可重复的 replay path：`LINE HELD` 和 `LINE CROSSED`
- 一个 Public Receipt 页面
- 少量 Redline Presets
- 一个 Accountability Card

明确不做：自动交易、托管、预测、借贷、质押、多链平台、复杂 AI agent、FCC 私密计算、多源威胁情报聚合和长期排行榜。

## Submission checklist

提交前必须补齐：

- [ ] 公开 App URL，不是 localhost
- [ ] Demo video URL
- [x] Coston2 合约地址和 explorer 链接
- [x] 部署交易和网络信息
- [x] 一条真实 FDC 验证记录：Sepolia swap → FDC round 1425147 → Coston2 `LINE HELD`
- [ ] 一条 `LINE HELD` 和一条 `LINE CROSSED` replay 记录
- [ ] Public Receipt 可不连接钱包打开
- [ ] 所有 fixture、mock、stale、unverified 数据有明确标签
- [ ] README、PRD、TECHNICAL 与实际部署一致

## Roadmap

1. 更多可验证的 FDC 外部事实来源、router 和资产适配器。
2. FAssets/FXRP 资产规则和更多互操作交易场景。
3. FTSO 参考价格规则。
4. 更丰富的账户和钱包适配。
5. 在 Bounty 1 Receipt/Evidence 基础稳定后，再单独评估 FCC 私密计算方向。

## Disclaimer

Redline 不是投资建议，也不能保证交易安全或避免亏损。它只帮助用户在签名前明确自己的限制，并在交易后验证交易事实是否符合这些限制。
