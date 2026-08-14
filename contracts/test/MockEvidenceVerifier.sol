// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRedlineEvidenceVerifier} from "../RedlineReceipt.sol";

contract MockEvidenceVerifier is IRedlineEvidenceVerifier {
    bool public verified = true;
    uint256 public externalChainId = 114;
    address public trader;
    address public router;
    address public tokenIn;
    address public tokenOut;
    uint256 public amountIn;
    uint256 public amountOut;
    bytes32 public transactionHash = keccak256("held");

    function setFacts(
        bool verified_,
        uint256 externalChainId_,
        address trader_,
        address router_,
        address tokenIn_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOut_,
        bytes32 transactionHash_
    ) external {
        verified = verified_;
        externalChainId = externalChainId_;
        trader = trader_;
        router = router_;
        tokenIn = tokenIn_;
        tokenOut = tokenOut_;
        amountIn = amountIn_;
        amountOut = amountOut_;
        transactionHash = transactionHash_;
    }

    function verify(bytes calldata)
        external
        view
        returns (bool, uint256, address, address, address, address, uint256, uint256, bytes32)
    {
        return (verified, externalChainId, trader, router, tokenIn, tokenOut, amountIn, amountOut, transactionHash);
    }
}
