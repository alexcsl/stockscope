// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {TradeOrder, ITradeAdapter} from "./TradeTypes.sol";

interface IV3Factory { function getPool(address, address, uint24) external view returns (address); }
interface IV3Router {
    struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
    function factory() external view returns (address);
}

contract V3Adapter is ITradeAdapter {
    using SafeERC20 for IERC20;
    address public immutable executor;
    IV3Router public immutable router;
    IV3Factory public immutable factory;

    constructor(address executor_, address router_, address factory_) {
        require(executor_.code.length > 0 && router_.code.length > 0 && factory_.code.length > 0 && IV3Router(router_).factory() == factory_);
        executor = executor_; router = IV3Router(router_); factory = IV3Factory(factory_);
    }

    function swap(TradeOrder calldata order) external returns (uint256 amountOut) {
        require(msg.sender == executor && order.protocol == 3 && order.tickSpacing == 0 && order.fee < 1_000_000, "Invalid V3 order");
        address pool = factory.getPool(order.input, order.output, order.fee);
        require(pool.code.length > 0 && bytes32(uint256(uint160(pool))) == order.poolId, "Wrong pool");
        uint256 beforeInput = IERC20(order.input).balanceOf(address(this));
        IERC20(order.input).safeTransferFrom(executor, address(this), order.amountIn);
        IERC20(order.input).forceApprove(address(router), order.amountIn);
        amountOut = router.exactInputSingle(IV3Router.ExactInputSingleParams(order.input, order.output, order.fee, executor, order.amountIn, order.minOut, 0));
        IERC20(order.input).forceApprove(address(router), 0);
        require(IERC20(order.input).balanceOf(address(this)) == beforeInput, "Partial V3 input");
    }
}
