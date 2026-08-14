import { createEvidence, createLiveEvidence } from "./core.js";

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
    // This is one immutable, deployed Coston2 Receipt—not a generic live claim.
    return createLiveEvidence();
  }
}
