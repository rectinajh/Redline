// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal verifier boundary for the first Redline Receipt prototype.
/// The production FDC verifier adapter must implement this interface after the
/// exact Coston2 proof fields are confirmed against Flare's Developer Hub.
interface IRedlineEvidenceVerifier {
    function verify(bytes calldata proof)
        external
        view
        returns (
            bool verified,
            uint256 externalChainId,
            address router,
            address tokenIn,
            address tokenOut,
            uint256 amountIn,
            uint256 amountOut,
            bytes32 transactionHash
        );
}

contract RedlineReceipt {
    enum Status {
        NONE,
        DRAFT,
        VERIFIED,
        LINE_HELD,
        LINE_CROSSED,
        EXPIRED,
        MISMATCHED,
        REPLAYED
    }

    struct Receipt {
        address trader;
        uint256 chainId;
        address router;
        address tokenIn;
        address tokenOut;
        uint256 maxInput;
        uint256 minOutput;
        uint256 maxPositionBps;
        uint64 expiry;
        bytes32 simulationHash;
        bytes32 riskAssessmentHash;
        bytes32 threatIntelSnapshotHash;
        uint256 nonce;
    }

    struct ExternalFacts {
        uint256 externalChainId;
        address router;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        bytes32 transactionHash;
    }

    uint256 public immutable expectedChainId;
    address public immutable verifier;
    address public immutable expectedRouter;
    address public immutable expectedTokenIn;
    address public immutable expectedTokenOut;

    mapping(bytes32 => Receipt) private receipts;
    mapping(bytes32 => Status) public statusOf;
    mapping(bytes32 => bool) public consumed;
    mapping(address => mapping(uint256 => bool)) public nonceUsed;

    error InvalidVerifier();
    error InvalidTrader();
    error WrongChain(uint256 actual, uint256 expected);
    error InvalidExpiry();
    error InvalidPosition();
    error NonceUsed();
    error ReceiptMissing();
    error ReceiptConsumed();
    error ProofInvalid();

    event ReceiptCreated(bytes32 indexed receiptId, address indexed trader, uint256 nonce);
    event ReceiptVerdict(bytes32 indexed receiptId, Status status, bytes32 indexed transactionHash);

    constructor(
        uint256 expectedChainId_,
        address verifier_,
        address expectedRouter_,
        address expectedTokenIn_,
        address expectedTokenOut_
    ) {
        if (verifier_ == address(0)) revert InvalidVerifier();
        expectedChainId = expectedChainId_;
        verifier = verifier_;
        expectedRouter = expectedRouter_;
        expectedTokenIn = expectedTokenIn_;
        expectedTokenOut = expectedTokenOut_;
    }

    function receiptId(Receipt calldata receipt) public pure returns (bytes32) {
        return keccak256(abi.encode(
            receipt.trader,
            receipt.chainId,
            receipt.router,
            receipt.tokenIn,
            receipt.tokenOut,
            receipt.maxInput,
            receipt.minOutput,
            receipt.maxPositionBps,
            receipt.expiry,
            receipt.simulationHash,
            receipt.riskAssessmentHash,
            receipt.threatIntelSnapshotHash,
            receipt.nonce
        ));
    }

    function submitReceipt(Receipt calldata receipt) external returns (bytes32 id) {
        if (receipt.trader != msg.sender) revert InvalidTrader();
        if (receipt.chainId != expectedChainId) revert WrongChain(receipt.chainId, expectedChainId);
        if (receipt.expiry <= block.timestamp) revert InvalidExpiry();
        if (receipt.maxPositionBps > 10_000) revert InvalidPosition();
        if (nonceUsed[msg.sender][receipt.nonce]) revert NonceUsed();
        if (receipt.router != expectedRouter || receipt.tokenIn != expectedTokenIn || receipt.tokenOut != expectedTokenOut) {
            revert InvalidTrader();
        }

        id = receiptId(receipt);
        nonceUsed[msg.sender][receipt.nonce] = true;
        receipts[id] = receipt;
        statusOf[id] = Status.DRAFT;
        emit ReceiptCreated(id, msg.sender, receipt.nonce);
    }

    function getReceipt(bytes32 id) external view returns (Receipt memory) {
        if (statusOf[id] == Status.NONE) revert ReceiptMissing();
        return receipts[id];
    }

    function verifyReceipt(bytes32 id, bytes calldata proof) external returns (Status finalStatus) {
        if (statusOf[id] == Status.NONE) revert ReceiptMissing();
        if (consumed[id]) revert ReceiptConsumed();

        Receipt memory receipt = receipts[id];
        if (block.timestamp > receipt.expiry) {
            consumed[id] = true;
            statusOf[id] = Status.EXPIRED;
            emit ReceiptVerdict(id, Status.EXPIRED, bytes32(0));
            return Status.EXPIRED;
        }

        (bool verified, uint256 externalChainId, address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, bytes32 transactionHash) =
            IRedlineEvidenceVerifier(verifier).verify(proof);
        if (!verified) revert ProofInvalid();

        if (externalChainId != receipt.chainId || router != receipt.router || tokenIn != receipt.tokenIn || tokenOut != receipt.tokenOut) {
            consumed[id] = true;
            statusOf[id] = Status.MISMATCHED;
            emit ReceiptVerdict(id, Status.MISMATCHED, transactionHash);
            return Status.MISMATCHED;
        }

        consumed[id] = true;
        if (amountIn > receipt.maxInput || amountOut < receipt.minOutput) {
            finalStatus = Status.LINE_CROSSED;
        } else {
            finalStatus = Status.LINE_HELD;
        }
        statusOf[id] = finalStatus;
        emit ReceiptVerdict(id, finalStatus, transactionHash);
    }
}
