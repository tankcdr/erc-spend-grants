// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AssetLimit, NATIVE, Reason, SpendGrant, SpendGrantError} from "../../src/SpendGrantTypes.sol";
import {SpendGrantHash} from "../../src/SpendGrantHash.sol";
import {SpendGrantRegistry} from "../../src/SpendGrantRegistry.sol";

/// @dev Exposes the registry's internal helpers to the symbolic checks.
contract SymbolicRegistry is SpendGrantRegistry {
    constructor(address executor_) SpendGrantRegistry(executor_) {}

    function live(uint64 stamped, uint64 windowSeconds) external view returns (bool) {
        return _live(stamped, windowSeconds);
    }

    function pack(uint64 time, uint256 amount) external pure returns (uint256) {
        return _pack(time, amount);
    }

    function unpack(uint256 word) external pure returns (uint64 time, uint256 amount) {
        return _unpack(word);
    }

    function debitDirect(bytes32 grantHash, uint64 windowSeconds, AssetLimit memory limit, uint256 amount) external {
        _debit(grantHash, windowSeconds, limit, NATIVE, amount, address(0xC0C));
    }
}

/// @dev Accepts every signature, so consume reaches the checks after BAD_SIGNATURE.
contract Accept1271 {
    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        return 0x1626ba7e;
    }
}

/// @dev Halmos properties (`check_` prefix; forge test does not run them). Run with `pnpm test:symbolic`.
contract SpendGrantSymbolic is Test {
    bytes32 internal constant GRANT = keccak256("grant");
    uint256 internal constant STEPS = 2;
    uint64 internal constant WINDOW = 3600;

    SymbolicRegistry internal registry;

    function setUp() public {
        registry = new SymbolicRegistry(address(this));
    }

    /// The code's liveness test equals the spec's primary form for every time, stamp, and window.
    function check_liveMatchesSpec(uint64 stamped, uint64 windowSeconds, uint64 ts) public {
        vm.warp(ts);
        assertEq(registry.live(stamped, windowSeconds), uint256(ts) < uint256(stamped) + uint256(windowSeconds));
    }

    /// Packing a debit word loses nothing for any timestamp and any 192-bit amount.
    function check_packRoundTrip(uint64 time, uint192 amount) public view {
        (uint64 t, uint256 a) = registry.unpack(registry.pack(time, amount));
        assertEq(t, time);
        assertEq(a, uint256(amount));
    }

    /// Over any short sequence of spends and time steps, consume accepts exactly when the
    /// spec's caps allow it (computed in exact arithmetic), reverts with the spec's reason
    /// when they do not, and the rolling and lifetime views equal the model afterward.
    struct Model {
        uint64[STEPS] times;
        uint256[STEPS] amounts;
        uint256 n;
        uint256 lifetime;
        uint64 now_;
    }

    /// Time steps are drawn from the expiry boundary (0, window - 1, window, window + 1);
    /// `check_liveMatchesSpec` covers the liveness arithmetic for every value. Caps and amounts
    /// are bounded to 64 bits so the solver finishes; `check_debitMatchesCapsFullWidth` covers
    /// the cap comparison at full width.
    function check_debitSequenceMatchesModel(
        uint256 maxPerCall,
        uint256 maxPerWindow,
        uint256 maxTotal,
        uint256[STEPS] memory amounts,
        uint8[STEPS] memory gaps
    ) public {
        vm.assume(maxPerCall > 0 && maxPerCall <= maxPerWindow && maxPerWindow <= maxTotal);
        vm.assume(maxTotal <= type(uint64).max);
        for (uint256 k = 0; k < STEPS; k++) {
            vm.assume(amounts[k] <= type(uint64).max);
        }
        AssetLimit memory limit = AssetLimit(NATIVE, maxPerCall, maxPerWindow, maxTotal);

        Model memory m;
        m.now_ = 1_700_000_000;
        for (uint256 k = 0; k < STEPS; k++) {
            uint8 g = gaps[k];
            vm.assume(g < 4);
            m.now_ += g == 0 ? 0 : g == 1 ? WINDOW - 1 : g == 2 ? WINDOW : WINDOW + 1;
            vm.warp(m.now_);
            _step(m, limit, WINDOW, amounts[k]);
        }
    }

    /// At full 256-bit width, a single spend is accepted exactly when the spec's caps allow it
    /// in exact arithmetic, and otherwise reverts with the spec's reason.
    function check_debitMatchesCapsFullWidth(uint256 maxPerCall, uint256 maxPerWindow, uint256 maxTotal, uint256 amount)
        public
    {
        vm.assume(maxPerCall > 0 && maxPerCall <= maxPerWindow && maxPerWindow <= maxTotal);
        Model memory m;
        m.now_ = 1_700_000_000;
        vm.warp(m.now_);
        _step(m, AssetLimit(NATIVE, maxPerCall, maxPerWindow, maxTotal), WINDOW, amount);
    }

    function _step(Model memory m, AssetLimit memory limit, uint64 windowSeconds, uint256 amount) internal {
        uint256 windowSum = _windowSum(m, windowSeconds);

        Reason expected = Reason.OK;
        if (amount == 0 || amount > limit.maxPerCall || amount > type(uint192).max) {
            expected = Reason.OVER_TX_CAP;
        } else if (_exceeds(windowSum, amount, limit.maxPerWindow)) {
            expected = Reason.OVER_WINDOW_CAP;
        } else if (_exceeds(m.lifetime, amount, limit.maxTotal)) {
            expected = Reason.OVER_CUMULATIVE_CAP;
        }

        try registry.debitDirect(GRANT, windowSeconds, limit, amount) {
            assertTrue(expected == Reason.OK);
            m.times[m.n] = m.now_;
            m.amounts[m.n] = amount;
            m.n++;
            m.lifetime += amount;
            windowSum += amount;
        } catch (bytes memory err) {
            assertTrue(expected != Reason.OK);
            assertEq(err, abi.encodeWithSelector(SpendGrantError.selector, expected));
        }

        (uint256 spent,) = registry.usage(GRANT, NATIVE);
        (uint256 rolling,) = registry.rollingUsage(GRANT, NATIVE);
        assertEq(spent, m.lifetime);
        assertEq(rolling, windowSum);
        assertLe(rolling, limit.maxPerWindow);
        assertLe(spent, limit.maxTotal);
    }

    /// @dev The spec's primary liveness form, independent of the registry's `_live`.
    function _windowSum(Model memory m, uint64 windowSeconds) internal pure returns (uint256 sum) {
        for (uint256 i = 0; i < m.n; i++) {
            if (uint256(m.now_) < uint256(m.times[i]) + uint256(windowSeconds)) sum += m.amounts[i];
        }
    }

    /// Once a principal revokes a grant, no call to consume succeeds, whatever the amount or recipient.
    function check_revokedGrantNeverConsumes(uint256 amount, address recipient) public {
        Accept1271 principal = new Accept1271();
        SpendGrant memory g = _grant(address(principal));
        bytes32 grantHash = SpendGrantHash.digest(block.chainid, address(registry), g);

        vm.prank(address(principal));
        registry.revoke(grantHash);

        vm.warp(g.validAfter);
        try registry.consume(g, "", NATIVE, amount, recipient) {
            assertTrue(false);
        } catch (bytes memory err) {
            assertEq(err, abi.encodeWithSelector(SpendGrantError.selector, Reason.REVOKED));
        }
    }

    /// No caller other than the executor can record a debit.
    function check_onlyExecutorConsumes(address caller, uint256 amount, address recipient) public {
        vm.assume(caller != address(this));
        SpendGrant memory g = _grant(address(new Accept1271()));
        vm.prank(caller);
        try registry.consume(g, "", NATIVE, amount, recipient) {
            assertTrue(false);
        } catch (bytes memory err) {
            assertEq(err, abi.encodeWithSelector(SpendGrantError.selector, Reason.UNAUTHORIZED_EXECUTOR));
        }
    }

    /// @dev `used + amount > cap` in exact (257-bit) arithmetic.
    function _exceeds(uint256 used, uint256 amount, uint256 cap) internal pure returns (bool) {
        unchecked {
            uint256 sum = used + amount;
            return sum < used || sum > cap;
        }
    }

    function _grant(address principal) internal pure returns (SpendGrant memory g) {
        g.principal = principal;
        g.delegate = address(0xB0B);
        g.recipientMode = 1;
        g.windowSeconds = 86400;
        g.validAfter = 1_700_000_000;
        g.validUntil = 1_800_000_000;
        g.salt = 1;
        g.assets = new AssetLimit[](1);
        g.assets[0] = AssetLimit(NATIVE, 1e18, 5e18, 10e18);
    }
}
