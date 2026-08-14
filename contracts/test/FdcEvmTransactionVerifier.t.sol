// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FdcEvmTransactionVerifier, IFdcEvmTransactionVerification} from "../FdcEvmTransactionVerifier.sol";
import {MockFdcVerification} from "./MockFdcVerification.sol";

contract FdcEvmTransactionVerifierTest {
    bytes32 internal constant TRANSFER_TOPIC =
        0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef;
    address internal constant TRADER = 0xB675d67909185f5E983EC51b2AED14667eA31b33;
    address internal constant ROUTER = 0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468;
    address internal constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    function testNativeEthToErc20Facts() external {
        MockFdcVerification mock = new MockFdcVerification();
        FdcEvmTransactionVerifier verifier = new FdcEvmTransactionVerifier(address(mock));

        uint32[] memory requestIndices = new uint32[](0);
        IFdcEvmTransactionVerification.Event[] memory events =
            new IFdcEvmTransactionVerification.Event[](1);
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = TRANSFER_TOPIC;
        topics[1] = bytes32(uint256(uint160(ROUTER)));
        topics[2] = bytes32(uint256(uint160(TRADER)));
        events[0] = IFdcEvmTransactionVerification.Event({
            logIndex: 1,
            emitterAddress: USDC,
            topics: topics,
            data: abi.encode(uint256(980_000)),
            removed: false
        });

        IFdcEvmTransactionVerification.Response memory response;
        response.attestationType = verifier.EVM_TRANSACTION();
        response.sourceId = verifier.TEST_ETH();
        response.votingRound = 1;
        response.lowestUsedTimestamp = 1;
        response.requestBody = IFdcEvmTransactionVerification.RequestBody({
            transactionHash: keccak256("sepolia-swap"),
            requiredConfirmations: 1,
            provideInput: true,
            listEvents: true,
            logIndices: requestIndices
        });
        response.responseBody = IFdcEvmTransactionVerification.ResponseBody({
            blockNumber: 1,
            timestamp: 1,
            sourceAddress: TRADER,
            isDeployment: false,
            receivingAddress: ROUTER,
            value: 1 ether,
            input: hex"1234",
            status: 1,
            events: events
        });

        bytes32[] memory proofNodes = new bytes32[](0);
        bytes memory packedProof = abi.encode(proofNodes, abi.encode(response));
        (
            bool verified,
            uint256 chainId,
            address trader,
            address router,
            address tokenIn,
            address tokenOut,
            uint256 amountIn,
            uint256 amountOut,
            bytes32 txHash
        ) = verifier.verify(packedProof);

        require(verified, "not verified");
        require(chainId == 11_155_111, "wrong chain");
        require(trader == TRADER, "wrong trader");
        require(router == ROUTER, "wrong router");
        require(tokenIn == address(0), "wrong input token");
        require(tokenOut == USDC, "wrong output token");
        require(amountIn == 1 ether, "wrong input amount");
        require(amountOut == 980_000, "wrong output amount");
        require(txHash == keccak256("sepolia-swap"), "wrong tx hash");
    }

    function testUnsupportedProofFailsClosed() external {
        MockFdcVerification mock = new MockFdcVerification();
        FdcEvmTransactionVerifier verifier = new FdcEvmTransactionVerifier(address(mock));
        mock.setProved(false);
        IFdcEvmTransactionVerification.Response memory response;
        response.attestationType = verifier.EVM_TRANSACTION();
        response.sourceId = verifier.TEST_ETH();
        response.requestBody.logIndices = new uint32[](0);
        response.responseBody.events = new IFdcEvmTransactionVerification.Event[](0);
        bytes memory packedProof = abi.encode(new bytes32[](0), abi.encode(response));
        (bool verified,,,,,,,,) = verifier.verify(packedProof);
        require(!verified, "unsupported proof accepted");
    }
}
