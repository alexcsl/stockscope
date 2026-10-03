// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TradeOrder} from "../TradeTypes.sol";
import {IV3Router} from "../V3Adapter.sol";
import {IV4Manager} from "../V4Adapter.sol";

contract MockToken is ERC20 {
    uint8 private immutable precision;
    uint256 public uiMultiplier = 1e18;
    bool public oraclePaused;
    constructor(string memory name_, uint8 decimals_) ERC20(name_, name_) { precision = decimals_; }
    function decimals() public view override returns (uint8) { return precision; }
    function mint(address user, uint256 amount) external { _mint(user, amount); }
    function setMultiplier(uint256 value) external { uiMultiplier = value; }
    function setOraclePaused(bool value) external { oraclePaused = value; }
}
contract MockFeed {
    uint8 public decimals = 8;
    int256 public price;
    uint256 public updated;
    uint256 public started;
    constructor(int256 price_) { price = price_; updated = block.timestamp; started = block.timestamp - 7200; }
    function set(int256 price_, uint256 updated_) external { price = price_; updated = updated_; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) { return (1, price, started, updated, 1); }
}
contract MockPool {}
contract MockFactory {
    address public pool;
    constructor(address pool_) { pool = pool_; }
    function getPool(address, address, uint24) external view returns (address) { return pool; }
}
contract MockRouter {
    address public immutable factory;
    bool public insufficient;
    bool public partialFill;
    bytes private reentry;
    address private executor;
    bool public reentryRejected;
    constructor(address factory_) { factory = factory_; }
    struct QuoteParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }
    function quoteExactInputSingle(QuoteParams calldata params) external view returns (uint256, uint160, uint32, uint256) {
        return (MockToken(params.tokenIn).decimals() == 6 ? params.amountIn * 5e9 : params.amountIn / 5e9, 0, 0, 100000);
    }
    function setInsufficient(bool value) external { insufficient = value; }
    function setPartial(bool value) external { partialFill = value; }
    function setReentry(address executor_, bytes calldata data) external { executor = executor_; reentry = data; }
    function exactInputSingle(IV3Router.ExactInputSingleParams calldata params) external payable returns (uint256 output) {
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), partialFill ? params.amountIn - 1 : params.amountIn);
        if (reentry.length > 0) { (bool success,) = executor.call(reentry); reentryRejected = !success; }
        output = MockToken(params.tokenIn).decimals() == 6 ? params.amountIn * 5e9 : params.amountIn / 5e9;
        if (insufficient) output = 1;
        MockToken(params.tokenOut).mint(params.recipient, output);
    }
}
interface ICallback { function unlockCallback(bytes calldata data) external returns (bytes memory); }
contract MockManager {
    address private current;
    address private synced;
    uint256 private balance;
    bool public partialFill;
    struct QuoteParams { IV4Manager.PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }
    function quoteExactInputSingle(QuoteParams calldata params) external view returns (uint256, uint256) {
        address input = params.zeroForOne ? params.poolKey.currency0 : params.poolKey.currency1;
        return (MockToken(input).decimals() == 6 ? uint256(params.exactAmount) * 5e9 : uint256(params.exactAmount) / 5e9, 100000);
    }
    function setPartial(bool value) external { partialFill = value; }
    function unlock(bytes calldata data) external returns (bytes memory) { current = msg.sender; bytes memory result = ICallback(msg.sender).unlockCallback(data); current = address(0); return result; }
    function swap(IV4Manager.PoolKey calldata key, IV4Manager.SwapParams calldata params, bytes calldata) external view returns (int256) {
        require(msg.sender == current && key.hooks == address(0));
        address input = params.zeroForOne ? key.currency0 : key.currency1;
        uint256 amount = uint256(-params.amountSpecified);
        if (partialFill) amount--;
        uint256 output = MockToken(input).decimals() == 6 ? amount * 5e9 : amount / 5e9;
        int128 deltaIn = -int128(int256(amount));
        int128 deltaOut = int128(int256(output));
        int128 d0 = params.zeroForOne ? deltaIn : deltaOut;
        int128 d1 = params.zeroForOne ? deltaOut : deltaIn;
        return (int256(d0) << 128) | int256(uint256(uint128(d1)));
    }
    function sync(address currency) external { require(msg.sender == current); synced = currency; balance = IERC20(currency).balanceOf(address(this)); }
    function settle() external payable returns (uint256) { require(msg.sender == current); return IERC20(synced).balanceOf(address(this)) - balance; }
    function take(address currency, address recipient, uint256 amount) external { require(msg.sender == current); MockToken(currency).mint(recipient, amount); }
}
