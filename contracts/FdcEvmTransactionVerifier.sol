// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRedlineEvidenceVerifier} from "./RedlineReceipt.sol";

/// @notice The Coston2 FDC verifier interface for the EVMTransaction attestation.
/// The structs mirror IEVMTransaction from Flare's periphery package.
interface IFdcEvmTransactionVerification {
    struct Event {
        uint32 logIndex;
        address emitterAddress;
        bytes32[] topics;
        bytes data;
        bool removed;
    }

    struct RequestBody {
        bytes32 transactionHash;
        uint16 requiredConfirmations;
        bool provideInput;
        bool listEvents;
        uint32[] logIndices;
    }

    struct ResponseBody {
        uint64 blockNumber;
        uint64 timestamp;
        address sourceAddress;
        bool isDeployment;
        address receivingAddress;
        uint256 value;
        bytes input;
        uint8 status;
        Event[] events;
    }

    struct Response {
        bytes32 attestationType;
        bytes32 sourceId;
        uint64 votingRound;
        uint64 lowestUsedTimestamp;
        RequestBody requestBody;
        ResponseBody responseBody;
    }

    struct Proof {
        bytes32[] merkleProof;
        Response data;
    }

    function verifyEVMTransaction(Proof calldata proof) external view returns (bool);
}

interface IFdcEvmTransactionVerificationContract {
    function verifyEVMTransaction(IFdcEvmTransactionVerification.Proof calldata proof)
        external
        view
        returns (bool);
}

/// @notice Converts a verified Sepolia EVMTransaction proof into Redline facts.
///
/// This first adapter intentionally supports one mechanic only:
/// native Sepolia ETH -> one ERC20 output transfer to the trader through the
/// transaction's receiving address. Unsupported shapes fail closed.
contract FdcEvmTransactionVerifier is IRedlineEvidenceVerifier {
    uint256 public constant SEPOLIA_CHAIN_ID = 11_155_111;
    bytes32 public constant EVM_TRANSACTION =
        0x45564d5472616e73616374696f6e000000000000000000000000000000000000;
    bytes32 public constant TEST_ETH =
        0x7465737445544800000000000000000000000000000000000000000000000000;
    bytes32 public constant TRANSFER_TOPIC =
        0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef;

    address public immutable fdcVerification;

    constructor(address fdcVerification_) {
        require(fdcVerification_ != address(0), "FDC verification is zero");
        fdcVerification = fdcVerification_;
    }

    /// @dev packedProof is abi.encode(bytes32[] merkleProof, bytes responseHex).
    function verify(bytes calldata packedProof)
        external
        view
        returns (
            bool verified,
            uint256 externalChainId,
            address trader,
            address router,
            address tokenIn,
            address tokenOut,
            uint256 amountIn,
            uint256 amountOut,
            bytes32 transactionHash
        )
    {
        (bytes32[] memory merkleProof, bytes memory responseBytes) =
            abi.decode(packedProof, (bytes32[], bytes));
        IFdcEvmTransactionVerification.Response memory data =
            abi.decode(responseBytes, (IFdcEvmTransactionVerification.Response));
        IFdcEvmTransactionVerification.Proof memory proof =
            IFdcEvmTransactionVerification.Proof({merkleProof: merkleProof, data: data});

        if (!IFdcEvmTransactionVerificationContract(fdcVerification).verifyEVMTransaction(proof)) {
            return (false, 0, address(0), address(0), address(0), address(0), 0, 0, bytes32(0));
        }
        if (data.attestationType != EVM_TRANSACTION || data.sourceId != TEST_ETH) {
            return (false, 0, address(0), address(0), address(0), address(0), 0, 0, bytes32(0));
        }
        if (data.responseBody.status != 1 || data.responseBody.sourceAddress == address(0)) {
            return (false, 0, address(0), address(0), address(0), address(0), 0, 0, bytes32(0));
        }

        address outputToken;
        uint256 outputAmount;
        for (uint256 i = 0; i < data.responseBody.events.length; i++) {
            IFdcEvmTransactionVerification.Event memory eventData = data.responseBody.events[i];
            if (eventData.removed || eventData.topics.length < 3 || eventData.data.length != 32) {
                continue;
            }
            if (
                eventData.topics[0] == TRANSFER_TOPIC
                    && address(uint160(uint256(eventData.topics[2]))) == data.responseBody.sourceAddress
            ) {
                outputToken = eventData.emitterAddress;
                outputAmount = abi.decode(eventData.data, (uint256));
                break;
            }
        }

        if (outputToken == address(0) || outputAmount == 0 || data.responseBody.value == 0) {
            return (false, 0, address(0), address(0), address(0), address(0), 0, 0, bytes32(0));
        }

        return (
            true,
            SEPOLIA_CHAIN_ID,
            data.responseBody.sourceAddress,
            data.responseBody.receivingAddress,
            address(0),
            outputToken,
            data.responseBody.value,
            outputAmount,
            data.requestBody.transactionHash
        );
    }
}
