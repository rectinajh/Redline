// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFdcEvmTransactionVerification, IFdcEvmTransactionVerificationContract} from "../FdcEvmTransactionVerifier.sol";

contract MockFdcVerification is IFdcEvmTransactionVerificationContract {
    bool public proved = true;

    function setProved(bool proved_) external {
        proved = proved_;
    }

    function verifyEVMTransaction(IFdcEvmTransactionVerification.Proof calldata)
        external
        view
        returns (bool)
    {
        return proved;
    }
}
