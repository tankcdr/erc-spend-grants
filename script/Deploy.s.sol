// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {SpendGrantRegistry} from "../src/SpendGrantRegistry.sol";
import {SpendGrantExecutor} from "../src/SpendGrantExecutor.sol";

/// @notice Deploys a registry and its executor from the broadcasting account.
/// @dev The registry stores the executor's address and the executor checks the registry points
/// back at it, so the executor's address is predicted from the deployer's nonce. Deploying from a
/// fresh account (nonce 0) gives the same two addresses on every chain.
contract Deploy is Script {
    function run() external returns (SpendGrantRegistry registry, SpendGrantExecutor executor) {
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        uint64 nonce = vm.getNonce(deployer);
        if (nonce != 0) console.log("warning: deployer nonce is not 0; addresses will differ across chains");

        address predictedExecutor = vm.computeCreateAddress(deployer, nonce + 1);
        registry = new SpendGrantRegistry(predictedExecutor);
        executor = new SpendGrantExecutor(registry);
        vm.stopBroadcast();

        require(address(executor) == predictedExecutor, "executor address mismatch");
        require(registry.executor() == address(executor), "registry does not point at executor");

        console.log("chainId", block.chainid);
        console.log("deployer", deployer);
        console.log("SpendGrantRegistry", address(registry));
        console.log("SpendGrantExecutor", address(executor));

        // Record addresses only for a real broadcast, not a dry run.
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return (registry, executor);

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "deployer", deployer);
        vm.serializeAddress(key, "registry", address(registry));
        string memory json = vm.serializeAddress(key, "executor", address(executor));
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
