// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {TradeOrder, ITradeAdapter} from "./TradeTypes.sol";

interface IV4Manager {
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey calldata key, SwapParams calldata params, bytes calldata hookData) external returns (int256);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address recipient, uint256 amount) external;
}

contract V4Adapter is ITradeAdapter {
    using SafeERC20 for IERC20;
    address public immutable executor;
    IV4Manager public immutable manager;
    bytes32 private activeOrder;

    constructor(address executor_, address manager_) { require(executor_.code.length > 0 && manager_.code.length > 0); executor = executor_; manager = IV4Manager(manager_); }

    function swap(TradeOrder calldata order) external returns (uint256 amountOut) {
        require(msg.sender == executor && activeOrder == bytes32(0) && order.protocol == 4 && order.fee < 1_000_000 && order.tickSpacing > 0 && order.amountIn <= uint256(uint128(type(int128).max)), "Invalid V4 order");
        IERC20(order.input).safeTransferFrom(executor, address(this), order.amountIn);
        bytes memory data = abi.encode(order);
        activeOrder = keccak256(data);
        amountOut = abi.decode(manager.unlock(data), (uint256));
        activeOrder = bytes32(0);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager) && activeOrder != bytes32(0) && keccak256(data) == activeOrder, "Invalid callback");
        activeOrder = bytes32(0);
        TradeOrder memory order = abi.decode(data, (TradeOrder));
        bool zeroForOne = order.input < order.output;
        IV4Manager.PoolKey memory key = IV4Manager.PoolKey(zeroForOne ? order.input : order.output, zeroForOne ? order.output : order.input, order.fee, order.tickSpacing, address(0));
        require(keccak256(abi.encode(key)) == order.poolId, "Wrong pool key");
        int256 delta = manager.swap(key, IV4Manager.SwapParams(zeroForOne, -int256(order.amountIn), zeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341), "");
        int128 amount0 = int128(delta >> 128);
        int128 amount1 = int128(delta);
        int128 owed = zeroForOne ? amount0 : amount1;
        int128 received = zeroForOne ? amount1 : amount0;
        require(owed < 0 && received > 0 && uint256(-int256(owed)) == order.amountIn && uint256(uint128(received)) >= order.minOut, "Invalid swap delta");
        manager.sync(order.input);
        IERC20(order.input).safeTransfer(address(manager), order.amountIn);
        require(manager.settle() == order.amountIn, "Settlement mismatch");
        manager.take(order.output, executor, uint256(uint128(received)));
        return abi.encode(uint256(uint128(received)));
    }
}
