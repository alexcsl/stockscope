// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TradeOrder, ITradeAdapter, IPriceFeed, IStockToken} from "./TradeTypes.sol";

contract GuardedExecutor is EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    bytes32 public constant ORDER_TYPEHASH = keccak256("TradeOrder(address user,address input,address output,address asset,uint256 amountIn,uint256 minOut,uint8 protocol,bytes32 poolId,uint24 fee,int24 tickSpacing,uint256 multiplier,uint256 nonce,uint256 deadline,uint256 policyVersion,uint256 configEpoch,bytes32 evidenceHash)");
    uint256 public constant MAX_INPUT_USD = 10e18;
    uint256 public constant POLICY_VERSION = 1;
    address public immutable usdg;
    address public immutable sequencer;
    address public policySigner;
    bool public paused = true;
    uint256 public configEpoch;
    mapping(address => uint256) public nonces;
    mapping(uint8 => address) public adapters;
    mapping(bytes32 => bool) public allowedPools;
    struct Oracle { address feed; uint32 maxAge; uint8 tokenDecimals; uint8 feedDecimals; }
    mapping(address => Oracle) public oracles;

    error Rejected(string reason);
    event Configured(uint256 epoch);
    event Executed(address indexed user, bytes32 indexed evidenceHash, address input, address output, uint256 amountIn, uint256 amountOut, uint256 nonce);

    constructor(address owner_, address signer_, address usdg_, address sequencer_) EIP712("StockScope", "1") Ownable(owner_) {
        require(signer_ != address(0) && usdg_.code.length > 0 && sequencer_.code.length > 0, "Invalid configuration");
        policySigner = signer_;
        usdg = usdg_;
        sequencer = sequencer_;
    }

    function setPaused(bool value) external onlyOwner { paused = value; configEpoch++; emit Configured(configEpoch); }
    function setSigner(address value) external onlyOwner { require(value != address(0)); policySigner = value; configEpoch++; emit Configured(configEpoch); }
    function setAdapter(uint8 protocol, address value) external onlyOwner { require((protocol == 3 || protocol == 4) && value.code.length > 0); adapters[protocol] = value; configEpoch++; emit Configured(configEpoch); }
    function setPool(uint8 protocol, bytes32 poolId, uint24 fee, int24 spacing, bool allowed) external onlyOwner {
        require((protocol == 3 || protocol == 4) && fee < 1_000_000 && (protocol == 3 ? spacing == 0 : spacing > 0));
        allowedPools[keccak256(abi.encode(protocol, poolId, fee, spacing))] = allowed;
        configEpoch++; emit Configured(configEpoch);
    }
    function setOracle(address token, address feed, uint32 maxAge) external onlyOwner {
        require(token.code.length > 0 && feed.code.length > 0 && maxAge > 0 && maxAge <= 3600);
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        uint8 feedDecimals = IPriceFeed(feed).decimals();
        require(tokenDecimals <= 18 && feedDecimals <= 18);
        oracles[token] = Oracle(feed, maxAge, tokenDecimals, feedDecimals);
        configEpoch++; emit Configured(configEpoch);
    }
    function withdrawResidual(address token, uint256 amount) external onlyOwner nonReentrant { require(paused); IERC20(token).safeTransfer(owner(), amount); }
    function cancelNonce() external { nonces[msg.sender]++; }

    function digest(TradeOrder calldata order) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(bytes.concat(abi.encode(ORDER_TYPEHASH), abi.encode(order))));
    }

    function inputValue(address token, uint256 amount) public view returns (uint256) {
        Oracle memory config = oracles[token];
        if (config.feed == address(0)) revert Rejected("oracle_unconfigured");
        (uint80 round, int256 answer,, uint256 updated, uint80 answered) = IPriceFeed(config.feed).latestRoundData();
        if (answer <= 0 || updated == 0 || updated > block.timestamp || block.timestamp - updated > config.maxAge || answered < round || IPriceFeed(config.feed).decimals() != config.feedDecimals || IERC20Metadata(token).decimals() != config.tokenDecimals) revert Rejected("oracle_invalid");
        uint256 tokenPrice = Math.mulDiv(uint256(answer), 1e18, 10 ** config.feedDecimals, Math.Rounding.Ceil);
        return Math.mulDiv(amount, tokenPrice, 10 ** config.tokenDecimals, Math.Rounding.Ceil);
    }

    function execute(TradeOrder calldata order, bytes calldata signature) external nonReentrant returns (uint256 amountOut) {
        if (paused) revert Rejected("paused");
        if (order.user != msg.sender || order.input == order.output || order.asset == usdg || !((order.input == usdg && order.output == order.asset) || (order.input == order.asset && order.output == usdg))) revert Rejected("wrong_parties");
        if (order.nonce != nonces[msg.sender] || order.deadline < block.timestamp || order.deadline > block.timestamp + 30 || order.policyVersion != POLICY_VERSION || order.configEpoch != configEpoch || order.evidenceHash == bytes32(0)) revert Rejected("invalid_context");
        if (ECDSA.recover(digest(order), signature) != policySigner) revert Rejected("invalid_signer");
        address adapter = adapters[order.protocol];
        if (adapter == address(0) || !allowedPools[keccak256(abi.encode(order.protocol, order.poolId, order.fee, order.tickSpacing))]) revert Rejected("unsupported_pool");
        (, int256 status, uint256 started,,) = IPriceFeed(sequencer).latestRoundData();
        if (status != 0 || started == 0 || started > block.timestamp || block.timestamp - started <= 3600) revert Rejected("sequencer_unavailable");
        if (IStockToken(order.asset).oraclePaused() || IStockToken(order.asset).uiMultiplier() != order.multiplier) revert Rejected("asset_changed");
        if (order.amountIn == 0 || order.minOut == 0 || inputValue(order.input, order.amountIn) > MAX_INPUT_USD) revert Rejected("amount_limit");
        inputValue(order.output, 1);
        nonces[msg.sender]++;
        uint256 beforeIn = IERC20(order.input).balanceOf(address(this));
        uint256 beforeOut = IERC20(order.output).balanceOf(address(this));
        IERC20(order.input).safeTransferFrom(msg.sender, address(this), order.amountIn);
        if (IERC20(order.input).balanceOf(address(this)) != beforeIn + order.amountIn) revert Rejected("input_transfer");
        IERC20(order.input).forceApprove(adapter, order.amountIn);
        ITradeAdapter(adapter).swap(order);
        IERC20(order.input).forceApprove(adapter, 0);
        amountOut = IERC20(order.output).balanceOf(address(this)) - beforeOut;
        if (amountOut < order.minOut || IERC20(order.input).balanceOf(address(this)) != beforeIn) revert Rejected("output_or_input_mismatch");
        uint256 recipientBefore = IERC20(order.output).balanceOf(msg.sender);
        IERC20(order.output).safeTransfer(msg.sender, amountOut);
        if (IERC20(order.output).balanceOf(msg.sender) != recipientBefore + amountOut) revert Rejected("output_transfer");
        emit Executed(msg.sender, order.evidenceHash, order.input, order.output, order.amountIn, amountOut, order.nonce);
    }
}
