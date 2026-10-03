// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {GuardedExecutor} from "./GuardedExecutor.sol";
import {V3Adapter} from "./V3Adapter.sol";

interface IDemoFactory {
    function createPool(address, address, uint24) external returns (address);
}
interface IDemoPool {
    function initialize(uint160) external;
    function mint(address, int24, int24, uint128, bytes calldata) external returns (uint256, uint256);
}

contract DemoToken is ERC20 {
    uint8 private immutable precision;
    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 supply) ERC20(name_, symbol_) {
        precision = decimals_;
        _mint(msg.sender, supply);
    }
    function decimals() public view override returns (uint8) { return precision; }
    function uiMultiplier() external pure returns (uint256) { return 1e18; }
    function oraclePaused() external pure returns (bool) { return false; }
}

contract DemoFeed {
    address public immutable owner;
    int256 public immutable answer;
    uint8 public constant decimals = 8;
    uint256 public updatedAt;
    uint256 public immutable startedAt;
    constructor(int256 answer_) {
        owner = msg.sender;
        answer = answer_;
        updatedAt = block.timestamp;
        startedAt = block.timestamp - 7200;
    }
    function refresh() external { require(msg.sender == owner, "Only demo owner"); updatedAt = block.timestamp; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, startedAt, updatedAt, 1);
    }
}

contract TestnetDemo {
    address public immutable owner;
    DemoToken public immutable stablecoin;
    DemoToken public immutable stock;
    DemoFeed public immutable stableFeed;
    DemoFeed public immutable stockFeed;
    DemoFeed public immutable sequencer;
    GuardedExecutor public immutable executor;
    V3Adapter public immutable adapter;
    address public immutable pool;
    bool public activated;
    bool private minting;

    constructor(address owner_, address signer_, address router_, address factory_) {
        require(block.chainid == 421614 && owner_ != address(0), "Arbitrum Sepolia only");
        owner = owner_;
        stablecoin = new DemoToken("StockScope Demo USDG", "DEMO-USDG", 6, 1_000_000e6);
        stock = new DemoToken("StockScope Demo AAPL", "DEMO-AAPL", 18, 5_000e18);
        stableFeed = new DemoFeed(100_000_000);
        stockFeed = new DemoFeed(20_000_000_000);
        sequencer = new DemoFeed(0);
        executor = new GuardedExecutor(address(this), signer_, address(stablecoin), address(sequencer));
        adapter = new V3Adapter(address(executor), router_, factory_);
        pool = IDemoFactory(factory_).createPool(address(stablecoin), address(stock), 3000);
        uint256 ratioX192 = address(stablecoin) < address(stock) ? uint256(5_000_000_000) << 192 : (uint256(200) << 192) / 1e12;
        IDemoPool(pool).initialize(uint160(Math.sqrt(ratioX192)));
    }

    function activate() external {
        require(msg.sender == owner && !activated, "Only inactive demo owner");
        activated = true;
        minting = true;
        IDemoPool(pool).mint(address(this), -887220, 887220, 1e16, "");
        minting = false;
        executor.setOracle(address(stablecoin), address(stableFeed), 3600);
        executor.setOracle(address(stock), address(stockFeed), 3600);
        executor.setAdapter(3, address(adapter));
        executor.setPool(3, bytes32(uint256(uint160(pool))), 3000, 0, true);
        refreshFeeds();
        executor.setPaused(false);
        executor.transferOwnership(owner);
        stablecoin.transfer(owner, 100e6);
        stock.transfer(owner, 1e18);
    }

    function refreshFeeds() public {
        require(msg.sender == owner, "Only demo owner");
        stableFeed.refresh();
        stockFeed.refresh();
        sequencer.refresh();
    }

    function uniswapV3MintCallback(uint256 amount0, uint256 amount1, bytes calldata) external {
        require(msg.sender == pool && minting, "Unexpected pool callback");
        (address token0, address token1) = address(stablecoin) < address(stock) ? (address(stablecoin), address(stock)) : (address(stock), address(stablecoin));
        if (amount0 > 0) require(IERC20(token0).transfer(pool, amount0));
        if (amount1 > 0) require(IERC20(token1).transfer(pool, amount1));
    }
}
