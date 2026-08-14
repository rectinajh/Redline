import { LIVE_RECEIPT_ID, createEvidence, createLiveEvidence } from "./core.js";
import { readReceipt } from "./chain.js";

export class FixtureAdapter {
  constructor(kind = "held") {
    this.kind = kind;
  }

  async getEvidence(draft) {
    return createEvidence(draft, this.kind);
  }
}

export class LiveFdcAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  async getEvidence() {
    const receiptId = this.config.receiptId || LIVE_RECEIPT_ID;
    const onchain = await readReceipt(receiptId);
    if (!onchain.receipt) throw new Error("Receipt is not published on Coston2");
    return createLiveEvidence({ receiptId, onchain });
  }
}
