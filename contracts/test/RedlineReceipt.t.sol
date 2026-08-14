// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RedlineReceipt} from "../RedlineReceipt.sol";
import {MockEvidenceVerifier} from "./MockEvidenceVerifier.sol";

contract RedlineReceiptTest {
    uint256 internal constant COSTON2 = 114;
    address internal constant ROUTER = address(0x1111);
    address internal constant TOKEN_IN = address(0x2222);
    address internal constant TOKEN_OUT = address(0x3333);

    MockEvidenceVerifier internal mock;
    RedlineReceipt internal receipt;

    function setUp() public {
        mock = new MockEvidenceVerifier();
        mock.setFacts(true, COSTON2, ROUTER, TOKEN_IN, TOKEN_OUT, 1 ether, 0.98 ether, keccak256("held"));
        receipt = new RedlineReceipt(COSTON2, address(mock), ROUTER, TOKEN_IN, TOKEN_OUT);
    }

    function testHeldVerdict() public {
        RedlineReceipt.Receipt memory draft = _draft(1, 0.98 ether, 10 minutes);
        bytes32 id = receipt.submitReceipt(draft);
        RedlineReceipt.Status result = receipt.verifyReceipt(id, hex"01");
        require(result == RedlineReceipt.Status.LINE_HELD, "expected HELD");
        require(receipt.consumed(id), "receipt must be consumed");
    }

    function testCrossedVerdict() public {
        mock.setFacts(true, COSTON2, ROUTER, TOKEN_IN, TOKEN_OUT, 2 ether, 0.9 ether, keccak256("crossed"));
        RedlineReceipt.Receipt memory draft = _draft(2, 0.98 ether, 10 minutes);
        bytes32 id = receipt.submitReceipt(draft);
        RedlineReceipt.Status result = receipt.verifyReceipt(id, hex"02");
        require(result == RedlineReceipt.Status.LINE_CROSSED, "expected CROSSED");
    }

    function testMismatchVerdict() public {
        mock.setFacts(true, COSTON2, address(0x9999), TOKEN_IN, TOKEN_OUT, 1 ether, 1 ether, keccak256("mismatch"));
        RedlineReceipt.Receipt memory draft = _draft(3, 0.98 ether, 10 minutes);
        bytes32 id = receipt.submitReceipt(draft);
        RedlineReceipt.Status result = receipt.verifyReceipt(id, hex"03");
        require(result == RedlineReceipt.Status.MISMATCHED, "expected MISMATCHED");
    }

    function testReplayIsRejected() public {
        RedlineReceipt.Receipt memory draft = _draft(4, 0.98 ether, 10 minutes);
        bytes32 id = receipt.submitReceipt(draft);
        receipt.verifyReceipt(id, hex"04");
        (bool success,) = address(receipt).call(abi.encodeWithSelector(receipt.verifyReceipt.selector, id, hex"04"));
        require(!success, "replay must revert");
    }

    function _draft(uint256 nonce, uint256 minOutput, uint256 duration) internal view returns (RedlineReceipt.Receipt memory) {
        return RedlineReceipt.Receipt({
            trader: address(this),
            chainId: COSTON2,
            router: ROUTER,
            tokenIn: TOKEN_IN,
            tokenOut: TOKEN_OUT,
            maxInput: 1 ether,
            minOutput: minOutput,
            maxPositionBps: 100,
            expiry: uint64(block.timestamp + duration),
            simulationHash: keccak256("simulation"),
            riskAssessmentHash: keccak256("risk"),
            threatIntelSnapshotHash: keccak256("intel"),
            nonce: nonce
        });
    }
}
