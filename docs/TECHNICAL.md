# Redline Receipt 技术开发文档

版本：TECHNICAL v1.0
状态：Hackathon MVP 实现中；FDC live path 待 Coston2 验证
目标网络：Coston2，Chain ID 114
目标 bounty：Bounty 1 — Interoperable Asset Products

## 1. 技术目标与边界

本地运行：

```bash
npm start
npm test
forge test
```

已实现的本地闭环包括 Risk Capsule、确定性检查、Fixture Evidence、`LINE HELD`/`LINE CROSSED`、Public Receipt、Wallet 连接入口和 Receipt 合约测试。Live FDC adapter 当前 fail-closed 返回 `UNVERIFIED`，不会伪造 proof。

技术目标是构建一条可复核的事实链：

```text
用户限制 → canonical Receipt → 外部 swap → FDC proof → Flare 合约 → Verdict
```

本版本的 canonical source 已锁定为 Sepolia Ethereum 的 `testETH`，attestation type 为 `EVMTransaction`，目标合约部署在 Coston2。只支持一个 router、一个交易对和一个受控 fixture。FDC request/proof 的官方参考是 [EVMTransaction guide](https://dev.flare.network/fdc/guides/hardhat/evm-transaction)、[getting started](https://dev.flare.network/fdc/getting-started) 和 [IEVMTransaction](https://dev.flare.network/fdc/reference/IEVMTransaction)。真实 router、交易哈希和 verifier 结果仍必须通过 live smoke test 确认；当前部署 allowlist 已锁定为该受控路径。

不做：自动签名、自动执行、资产托管、可升级代理、多链平台、FAssets 生产适配、FCC 私密计算、多源 threat-intel 聚合。

## 2. 系统架构

```text
┌─────────────────────┐
│ Web UI               │
│ Presets / Flow /     │
│ Risk / Receipt       │
└──────────┬──────────┘
           │ canonical payload + wallet actions
           ▼
┌─────────────────────┐       ┌────────────────────────┐
│ API / Risk           │──────▶│ Risk Orchestrator       │
│ Orchestrator         │       │ threat + AI + schema    │
└──────────┬──────────┘       └────────────┬───────────┘
           │                               │ Risk Capsule
           │                               ▼
           │                    ┌────────────────────────┐
           │                    │ canonical hash          │
           │                    └────────────┬───────────┘
           │                                 │
           ▼                                 ▼
┌─────────────────────┐             ┌────────────────────┐
│ Evidence Adapters    │────────────▶│ Flare Receipt       │
│ LiveFdc / Fixture    │ normalized  │ proof + verdict     │
└─────────────────────┘ evidence     └─────────┬──────────┘
                                               │
                                               ▼
                                  ┌────────────────────────┐
                                  │ Public Receipt / Card   │
                                  └────────────────────────┘
```

### 2.1 组件职责

| 组件 | 职责 | 禁止事项 |
|---|---|---|
| Web UI | 收集规则、展示风险、触发用户钱包操作、读取状态 | 不保存私钥；不决定最终 Verdict |
| Canonicalizer | 校验、规范化和 hash 输入 | 不猜测缺失字段 |
| Deterministic Checks | 检查 router、pair、滑点、授权、网络、模拟、资产变化 | 不依赖 AI 结论 |
| Risk Orchestrator | 调用单一 threat source 和 AI，生成结构化 Risk Capsule | 不修改 Receipt 事实字段 |
| LiveFdcAdapter | 请求、轮询、读取和标准化真实 FDC proof | 不伪造 fixture 数据 |
| FixtureAdapter | 输出固定、可重复的 demo evidence | 必须带 `FIXTURE` provenance |
| Flare Receipt | 验证 commitment、proof、nonce、expiry、replay，写最终 Verdict | 不提供任意管理员篡改接口 |
| Public Receipt | 只读显示最小公开证据 | 不修改链上状态 |

## 3. Schema v1

### 3.1 ReceiptSchema v1

```json
{
  "schemaVersion": "receipt.v1",
  "trader": "0x...",
  "chainId": 11155111,
  "router": "0x...",
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "maxInput": "1000000000000000000",
  "minOutput": "950000000000000000",
  "maxPositionBps": 100,
  "expiry": 1780000000,
  "simulationHash": "0x...",
  "riskAssessmentHash": "0x...",
  "threatIntelSnapshotHash": "0x...",
  "nonce": "0x..."
}
```

要求：

- 金额是整数最小单位的十进制字符串，不使用浮点。
- 地址经过 checksum/严格 EVM 地址校验。
- chainId 必须匹配外部交易 source；当前固定为 Sepolia `11155111`。Receipt 合约部署网络仍是 Coston2 `114`。
- `maxPositionBps` 在 `0..10000` 范围内。
- expiry 必须在当前时间之后且不超过 MVP 允许窗口。
- router、pair、token 和外部 source 必须匹配 allowlist。
- canonicalization 固定字段顺序、类型和空值语义。

### 3.2 EvidenceSchema v1

```json
{
  "schemaVersion": "evidence.v1",
  "provenance": "LIVE",
  "source": "fdc-evm-transaction",
  "retrievedAt": "2026-08-14T00:00:00Z",
  "expiresAt": "2026-08-14T00:05:00Z",
  "verificationStatus": "VERIFIED",
  "externalChainId": 11155111,
  "transactionHash": "0x...",
  "router": "0x...",
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amountIn": "1000000000000000000",
  "amountOut": "980000000000000000",
  "proofReference": "0x..."
}
```

`provenance` 只能是：`LIVE`、`FIXTURE`、`MOCK`、`UNVERIFIED`。

缺失 required 字段、空 proof、空交易结果、错误数字编码和不匹配字段进入 `INVALID_EVIDENCE` 或 `UNVERIFIED`，不能转成 0。

### 3.3 RiskCapsuleSchema v1

```json
{
  "schemaVersion": "risk_capsule.v1",
  "deterministicChecks": [
    {"name": "router_allowlist", "status": "OK", "reason": "..."},
    {"name": "simulation", "status": "CAUTION", "reason": "..."}
  ],
  "threatIntel": {
    "source": "one-auditable-source",
    "retrievedAt": "2026-08-14T00:00:00Z",
    "expiresAt": "2026-08-14T00:05:00Z",
    "status": "OK",
    "confidence": 0.8
  },
  "ai": {
    "status": "READY",
    "modelVersion": "TBD",
    "summary": "...",
    "reasons": ["..."],
    "confidence": 0.7
  },
  "simulationHash": "0x..."
}
```

AI 允许解释和排序 `reasons`，不允许写入 `router`、`token`、`amount`、`minOutput`、`expiry` 或 `verdict`。

## 4. 状态与状态转移

### 4.1 ReceiptStatus

```text
DRAFT
SIGNED
TRADE_SUBMITTED
PROOF_REQUESTED
PROOF_FINALIZED
VERIFIED
LINE_HELD
LINE_CROSSED
EXPIRED
MISMATCHED
REPLAYED
UNVERIFIED
```

### 4.2 CheckStatus

```text
OK / CAUTION / BLOCKED / UNKNOWN / STALE
```

### 4.3 AIStatus

```text
READY / AI_UNAVAILABLE / AI_INVALID / AI_REFUSED / STALE
```

`SAFE` 不是正式状态。`LINE HELD` 只能由 Flare 合约在 proof 验证和 commitment 对照成功后写入。

## 5. FDC 集成流程

### 5.1 Canonical request

```json
{
  "attestationType": "EVMTransaction padded to bytes32",
  "sourceId": "testETH padded to bytes32",
  "requestBody": {
    "transactionHash": "<Sepolia transaction hash>",
    "requiredConfirmations": "1",
    "provideInput": true,
    "listEvents": true,
    "logIndices": []
  }
}
```

本仓库对应脚本：

```bash
FDC_VERIFIER_API_KEY=... node scripts/fdc/prepare-request.mjs <sepolia-tx-hash>
node scripts/fdc/get-proof.mjs <voting-round-id> <abi-encoded-request>

提交 FDC 请求：`fdc:submit` 会通过 Contract Registry 动态解析 Coston2 的 FDC Hub，读取当前 request fee，调用 `requestAttestation(bytes)`，并根据交易所在区块计算 voting round。

proof 获取和打包：

```bash
PROOF_TMP=$(mktemp)
node scripts/fdc/get-proof.mjs <voting-round-id> <abi-encoded-request> > "$PROOF_TMP" \
  && mv "$PROOF_TMP" proof.json \
  || { rm -f "$PROOF_TMP"; echo "Proof not ready — retry the same round and request bytes."; }
node scripts/fdc/pack-proof.mjs proof.json
```

`pack-proof` 将 DA Layer raw response 的 `proof[]` 与 `response_hex` 编码成 `abi.encode(bytes32[] merkleProof, bytes responseBytes)`。该结果是 `FdcEvmTransactionVerifier.verify()` 和 `RedlineReceipt.verifyReceipt()` 的输入边界。

`pack-proof -` 支持从标准输入读取 raw proof，适合在本地直接管道到 `receipt:verify`，避免把 attestation response 写入磁盘。

`get-proof` 在默认 60 秒内轮询；若仍返回 `attestation request not found`，不应创建或覆盖 `proof.json`。保留同一个 voting round 和完整 `abiEncodedRequest`，稍后重试即可。`submit-request` 不硬编码 round 参数：它从 Coston2 Contract Registry 解析 `FlareSystemsManager`，读取 `firstVotingRoundStartTs` 和 `votingEpochDurationSeconds` 后计算 request 所属 round。

`contracts/FdcEvmTransactionVerifier.sol` 当前只支持一个受控路径：Sepolia `testETH` 原生 ETH 输入、成功交易、ERC-20 `Transfer` 输出给 source address；router 使用 `responseBody.receivingAddress`，输入 token 使用 `address(0)`。不符合该形状的 proof 返回 `verified=false`。

### 5.1 Coston2 部署

`npm run deploy:coston2` 会先部署 `FdcEvmTransactionVerifier`，其构造参数为从 Coston2 Contract Registry 动态解析的 `FdcVerification` 地址；随后部署 `RedlineReceipt`。默认 allowlist 对应当前 demo 的 Sepolia ETH → USDC route，可通过 `.env` 的 `REDLINE_*` 变量覆盖。该命令会广播两笔 Coston2 交易，因此不在 CI 或前端服务器中自动执行。

已部署并链上读取核验（Coston2 / Chain ID 114）：

- `FdcEvmTransactionVerifier`：[`0x0aeA880F18232fE82EdA800a874F5CbE99dd5693`](https://coston2-explorer.flare.network/address/0x0aeA880F18232fE82EdA800a874F5CbE99dd5693)，部署交易 [`0x6d58…90e1`](https://coston2-explorer.flare.network/tx/0x6d580b2467d81d87195783a7fcbea40392f3e1e769f6e80b3243d85d611390e1)。
- `RedlineReceipt`：[`0x01Dd46c45c7d5fC805B93CD331d6FaA60C735B74`](https://coston2-explorer.flare.network/address/0x01Dd46c45c7d5fC805B93CD331d6FaA60C735B74)，部署交易 [`0x2806…9dcf`](https://coston2-explorer.flare.network/tx/0x280699f42164faf3636326b57e445367d41948102a8e025b95247aab25999dcf)。
- 链上 immutable 配置：外部 chain `11155111`、adapter `0x0aeA…5693`、router `0x7DfD…1468`、native ETH 输入、Sepolia USDC `0x1c7D…7238`。

已完成 live smoke：Sepolia [`0xf85d…dcb4`](https://sepolia.etherscan.io/tx/0xf85d179a409f364e3bfea157155484cec869f7b61df81784b60cdab84eb1dcb4) 的 `EVMTransaction/testETH` request 在 FDC round `1425147` 获得 3-node Merkle proof。adapter 的链上只读验证返回 `verified=true`、`amountIn=1000000000000000`、`amountOut=33320629`。Receipt [`0x2118…ec24`](https://coston2-explorer.flare.network/tx/0xdafac332ea09369949906ae4ae14227d46d9469460e43972f30c7b345f3641e2) 消费该 proof 后写入 `LINE_HELD`（status `3`）。

部署后，`npm run receipt:submit -- <receipt-address>` 会由本地部署钱包创建一个 30 分钟有效的 demo Receipt：最大输入 `0.001 ETH`、最低输出 `30 USDC`，并打印 Receipt ID。`npm run receipt:verify -- <receipt-address> <receipt-id> <packed-proof>` 将 FDC proof 送至合约并打印最终 `LINE_HELD` / `LINE_CROSSED` 状态。
```

API key 只从环境变量读取，不进入 Git、前端或日志。

计划中的通用流程：

```text
1. 选择唯一外部 source/router/pair/fixture
2. 发送外部交易并保存 transactionHash
3. 在 Flare 请求对应 FDC attestation
4. 等待 finalization
5. 获取 proof
6. 在 Coston2 Receipt contract 验证 proof
7. 标准化 transaction facts
8. 对照 Receipt commitment
9. 写入 LINE_HELD 或 LINE_CROSSED
```

异步状态：

```text
PROOF_REQUESTED → PROOF_FINALIZED → VERIFIED
       │                │             │
       ▼                ▼             ├→ LINE_HELD
PROOF_TIMEOUT      PROOF_INVALID     └→ LINE_CROSSED
```

FDC timeout、invalid proof、RPC failure、字段 mismatch 不产生最终成功结果。

## 6. 合约设计

### 6.1 不可变配置

MVP 使用非 upgradeable 合约：

- constructor 固定 chainId、verifier、router/pair 配置
- 不提供管理员任意修改既有 Receipt 或 Verdict 的函数
- 如实现 pause，只能暂停创建新 Receipt，不能改历史结果
- 配置改变通过新合约地址完成

### 6.2 防重放

Receipt commitment 绑定：

```text
trader + chainId + router + tokenIn + tokenOut + limits + expiry + hashes + nonce
```

合约必须：

- 验证 trader/签名关系
- 验证 chainId
- 检查 expiry
- 检查 nonce 未使用
- 检查 receipt 未 consumed
- 检查 proof facts 与 commitment 匹配
- 验证后标记 consumed
- 区分 `REPLAYED`、`EXPIRED`、`MISMATCHED`

### 6.3 Verdict 规则

```text
if proof missing/invalid          → UNVERIFIED
if receipt expired                → EXPIRED
if receipt already consumed       → REPLAYED
if chain/router/token mismatched  → MISMATCHED
if amountIn > maxInput            → LINE_CROSSED
if amountOut < minOutput          → LINE_CROSSED
if all committed facts match      → LINE_HELD
```

AI 和前端不得绕过这些规则。

## 7. API 与服务边界

### 7.1 `POST /api/risk-capsules`

输入：canonical transaction intent、Receipt draft、provider context。

输出：RiskCapsuleSchema v1、hash、freshness、AI status。

错误：`INVALID_INPUT`、`AI_UNAVAILABLE`、`AI_INVALID`、`STALE`、`RISK_CAPSULE_INVALID`。

### 7.2 `POST /api/receipts`

输入：ReceiptSchema v1、Risk Capsule hash、idempotency key。

行为：重复 key 返回已存在 Receipt；不生成重复 Receipt。

### 7.3 `POST /api/fdc/requests`

输入：receiptId、transactionHash、source configuration。

行为：创建或返回现有 request，进入 `PROOF_REQUESTED`，不阻塞浏览器。

### 7.4 `GET /api/receipts/:id`

行为：返回当前状态和最小公开 projection。私有对象不泄露存在性。

### 7.5 `GET /receipt/:id`

行为：只读 Public Receipt。以链上状态为最终事实；不能修改 Receipt、proof 或 verdict。

## 8. 错误和救援表

| 错误 | 状态 | 救援动作 | 禁止行为 |
|---|---|---|---|
| AI timeout/429 | `AI_UNAVAILABLE` | bounded retry 或继续显示确定性检查 | 不能显示 SAFE |
| AI invalid JSON | `AI_INVALID` | schema reject | 不能使用模型字段 |
| threat stale | `STALE` | refresh 或显示未知 | 不能显示 OK |
| simulation revert | `BLOCKED`/`CAUTION` | 显示具体 reason | 不能自动签名 |
| wrong network | `NETWORK_MISMATCH` | 引导切换 Coston2 | 不能广播 |
| user rejected | `SIGNATURE_REJECTED` | 用户主动重试 | 不能自动重签 |
| RPC timeout | `TX_PENDING`/`RPC_UNAVAILABLE` | 查询 hash | 不能重复广播 |
| FDC pending | `PROOF_PENDING` | bounded polling | 不能判定 HELD |
| proof invalid | `PROOF_INVALID` | 显示原因/重新请求 | 不能降级为 fixture |
| receipt mismatch | `MISMATCHED` | 展示字段差异 | 不能覆盖 commitment |
| consumed nonce | `REPLAYED` | 只读旧结果 | 不能再次使用 |

## 9. Live 与 Fixture 适配器

```text
LiveFdcAdapter ─────┐
                    ├─▶ EvidenceSchema v1 ─▶ same Verdict rules
FixtureAdapter ─────┘
```

两个 adapter 必须独立实现，但输出同一 schema。Verdict Engine 读取 evidence，不读取“当前环境变量”判断是否 live。

Fixture 规范：

- 固定 payload 和 fixture id
- 固定 `provenance: FIXTURE`
- UI、Public Receipt、README 和视频都标记 `FIXTURE`
- fixture 不能伪造真实 FDC transaction hash 或 explorer proof
- HELD 和 CROSSED 两条 fixture 都必须覆盖

## 10. 安全开发要求

### 输入

- 全部金额整数化
- 地址 checksum 校验
- chain/router/pair allowlist
- expiry 边界检查
- 用户理由最大长度和输出转义
- provider 内容当作不可信输入
- prompt 使用固定模板和 quoted data

### Secrets

- AI key、threat key、RPC key 只存在服务端环境变量
- `.env` 不提交，只提交 `.env.example`
- 不把部署私钥放进应用服务
- 日志脱敏，不记录完整 prompt、理由、余额和 API key
- 提交 lockfile，固定依赖版本

### Public Receipt 隐私

- 不可枚举 Receipt ID
- 地址截断或 hash
- 只读 projection
- 不泄露私有 Receipt 的存在性
- 不公开原始 AI prompt 和私密理由

## 11. 测试计划

### Unit

- canonicalization/hash 稳定性
- 输入类型、边界、空值和零值
- allowlist、expiry、freshness
- held/crossed/mismatch/replayed 判断
- 状态机非法转移
- Risk Capsule schema 和 AI malformed cases

### Contract

- trader、chainId、nonce、expiry 绑定
- consumed 防重放
- proof mismatch 拒绝
- incomplete proof 不产生 `LINE HELD`
- immutable config

### Integration

- LiveFdcAdapter 和 FixtureAdapter 输出一致 schema
- Risk Capsule → hash → Receipt
- FDC pending/finalized/invalid 状态
- Public Receipt privacy projection

### E2E

1. Fixture/Live `LINE HELD`
2. Fixture `LINE CROSSED`
3. AI unavailable 仍可完成 deterministic preview
4. 用户刷新后恢复 pending Receipt

### Chaos

- RPC timeout
- FDC 429/500/invalid proof
- AI timeout/429/malformed/refusal
- 重复提交和重复轮询
- 钱包广播成功但浏览器超时

默认测试不得依赖互联网；Coston2 live smoke 独立运行。

## 12. 性能与可观测性

- 风险摘要首屏目标小于 2 秒（fixture/cache）
- 签名准备目标小于 5 秒
- FDC 异步，不承诺固定完成时间
- 完整 demo 目标小于 90 秒
- Risk Capsule 按 canonical hash 短 TTL 缓存
- Public Receipt 按 IP/Receipt ID rate limit
- FDC request 按 nonce 去重
- 轮询使用上限和指数退避

结构化事件：

```text
receipt.created
risk.checks.completed
threat_intel.loaded
ai.brief.completed
risk_capsule.hashed
receipt.signed
trade.submitted
fdc.requested
fdc.finalized
fdc.proof_verified
verdict.written
public_receipt.viewed
```

每条事件包含 `receiptId`、`traceId`、status、duration、errorCode 和 provenance，但不包含 secrets 和完整私密数据。

## 13. 部署顺序

```text
compile/test
  ↓
deploy immutable RedlineReceipt to Coston2
  ↓
record address/block/commit and verify explorer
  ↓
configure server chainId/address/verifier
  ↓
run live FDC smoke test
  ↓
deploy web and Public Receipt
  ↓
run public/mobile smoke test
  ↓
record submission links and video
```

提交前必须替换：

- `TBD` 合约地址
- explorer 链接
- public app URL
- video URL
- live transaction hash
- FDC request/proof reference

## 14. 回滚

前端或服务端问题：回滚到上一版 build/config，保留链上历史。

合约问题：

1. 停止旧合约创建新 Receipt。
2. 回滚 Web/API。
3. 查询已有 transaction/proof 状态，不重发。
4. 修复后部署新 immutable 地址。
5. 更新 server、frontend、README 和 explorer 链接。
6. 重新运行 live smoke 和 Public Receipt smoke。

旧地址、旧 Receipt 和旧 Verdict 不被覆盖。

## 15. 交付任务

- [ ] 验证 FDC source、transaction type、router、pair、proof 字段
- [ ] 实现和部署 Receipt v1
- [ ] 实现 LiveFdcAdapter/FixtureAdapter
- [ ] 实现 Risk Capsule 和 AI schema validator
- [ ] 实现异步状态、幂等和错误救援
- [ ] 实现 Public Receipt、Replay、Presets、Accountability Card
- [ ] 运行 unit、contract、integration、E2E 和 live smoke
- [ ] 填写 README 的地址、链接、交易哈希和视频

## 16. 技术风险声明

目前最大的技术未知数不是 AI，而是所选外部 EVM 交易源是否能在 Coston2 上完整走通 FDC 请求、finalization、proof retrieval 和 on-chain verification。实现团队必须优先验证这一点；如果验证失败，应缩小为一个官方支持且字段清晰的交易类型，而不是在最后一天同时支持多个源。
