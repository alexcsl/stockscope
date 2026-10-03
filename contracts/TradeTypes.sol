// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct TradeOrder {
    address user;
    address input;
    address output;
    address asset;
    uint256 amountIn;
    uint256 minOut;
    uint8 protocol;
    bytes32 poolId;
    uint24 fee;
    int24 tickSpacing;
    uint256 multiplier;
    uint256 nonce;
    uint256 deadline;
    uint256 policyVersion;
    uint256 configEpoch;
    bytes32 evidenceHash;
}

interface ITradeAdapter {
    function swap(TradeOrder calldata order) external returns (uint256);
}

interface IPriceFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

interface IStockToken {
    function uiMultiplier() external view returns (uint256);
    function oraclePaused() external view returns (bool);
}
