/* eslint-disable @typescript-eslint/prefer-for-of */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  type AbstractProvider,
  Contract,
  type JsonRpcProvider,
  ethers,
  solidityPackedKeccak256,
} from "ethers";
import { parse } from "csv-parse/browser/esm/sync"; // Importing the browser version of csv-parse
import { MerkleTree } from "merkletreejs";
import {
  DEFAULT_L2_TX_GAS_LIMIT,
  L1_BRIDGE_HUB_ADDRESS,
  L2_MERKLE_DISTRIBUTOR_ADDRESS,
  L2_MERKLE_DISTRIBUTOR_INTERFACE,
  L2_ZK_TOKEN_ADDRESS,
  REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
  ZKSYNC_ERA_CHAIN_ID,
} from "./contants";
import { BRIDGEHUB_ABI } from "zksync-ethers/build/utils";
import { type BigNumberish } from "ethers";
import { utils } from "zksync-ethers";
import { erc20Abi, isAddress } from "viem";

export async function readCSVFromUrl(url: string): Promise<string[][]> {
  const response = await fetch(url);
  const data = await response.text();

  return parse(data, { columns: false });
}

export async function readAllocationsAndL1EligibilityLists(
  allEligiblePath: string[],
  l1EligiblePath: string[],
  l2MerkleDistributorAddresses: string[],
): Promise<Allocation[]> {
  const result = [] as Allocation[];
  if (
    allEligiblePath.length !== l1EligiblePath.length ||
    l1EligiblePath.length !== l2MerkleDistributorAddresses.length
  ) {
    throw new Error(
      "Mismatch between the number of eligibility lists and the L1 addresses list!",
    );
  }
  for (let i = 0; i < allEligiblePath.length; ++i) {
    result.push({
      allEligible: await readCSVFromUrl(allEligiblePath[i]!),
      l1Eligible: await readCSVFromUrl(l1EligiblePath[i]!),
      l2MerkleDistributorAddress: l2MerkleDistributorAddresses[i]!,
    });
  }
  return result;
}

export async function getL2TransferData(to: string, amount: string) {
  const ERC20_INTERFACE = new ethers.Interface(erc20Abi);
  return {
    call_to_transfer: {
      to: L2_ZK_TOKEN_ADDRESS,
      function: "transfer",
      params: {
        to,
        amount,
      },
      l2_raw_calldata: ERC20_INTERFACE.encodeFunctionData("transfer", [
        to,
        amount,
      ]),
    },
  };
}
export interface Allocation {
  allEligible: string[][];
  l1Eligible: string[][];
  l2MerkleDistributorAddress: string;
}
function getOneL2ClaimData(allocation: Allocation, address: string) {
  const { leaves, tree } = constructMerkleTree(
    allocation.allEligible,
    allocation.l1Eligible,
  );
  let found = false;
  let leaf:
    | {
        hashBuffer: Buffer;
        address: string;
        index: number;
        amount: number;
      }
    | undefined;

  for (let i = 0; i < leaves.length; i++) {
    if (leaves[i]?.address?.toLowerCase() == address.toLowerCase()) {
      leaf = leaves[i] as unknown as {
        hashBuffer: Buffer;
        address: string;
        index: number;
        amount: number;
      };
      found = true;
      break;
    }
  }

  if (!found) {
    return null;
  }
  if (!leaf) {
    return null;
  }

  const merkleProof = tree.getHexProof(leaf.hashBuffer);
  return {
    address: leaf.address,
    call_to_claim: {
      to: allocation.l2MerkleDistributorAddress,
      function: "claim",
      params: {
        index: leaf.index,
        amount: leaf.amount,
        merkle_proof: merkleProof,
      },
      l2_raw_calldata: L2_MERKLE_DISTRIBUTOR_INTERFACE.encodeFunctionData(
        "claim",
        [leaf.index, leaf.amount, merkleProof],
      ),
    },
  };
}

export async function getL2ClaimData(
  allocations: Allocation[],
  address: string,
  isL1: boolean,
) {
  const claimCalldatas = {
    address,
    // eslint-disable-next-line @typescript-eslint/no-array-constructor
    calls_to_claim: new Array(),
  };
  for (let i = 0; i < allocations.length; ++i) {
    const claimCalldata = getOneL2ClaimData(allocations[i]!, address);
    if (claimCalldata) {
      claimCalldatas.calls_to_claim.push(claimCalldata.call_to_claim);
    }
  }

  if (claimCalldatas.calls_to_claim.length == 0) {
    throw new Error(
      `${isL1 ? utils.undoL1ToL2Alias(address) : address} address is not eligible`,
    );
  }

  return claimCalldatas;
}

export async function getL1TxInfo(
  l1Provider: JsonRpcProvider | AbstractProvider,
  to: string,
  l2Calldata: string,
  refundRecipient: string,
  gasPrice: BigNumberish,
) {
  const bridgeHub = new Contract(
    L1_BRIDGE_HUB_ADDRESS,
    BRIDGEHUB_ABI,
    l1Provider,
  );

  if (!bridgeHub ?? !bridgeHub.l2TransactionBaseCost) return;

  const neededValue = (await bridgeHub.l2TransactionBaseCost(
    ZKSYNC_ERA_CHAIN_ID,
    gasPrice,
    DEFAULT_L2_TX_GAS_LIMIT,
    REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
  )) as unknown as number;
  console.log("🚀 ~ neededValue:", neededValue);
  const params = {
    chainId: ZKSYNC_ERA_CHAIN_ID,
    mintValue: neededValue.toString(),
    l2Contract: to,
    l2Value: 0,
    l2Calldata,
    l2GasLimit: DEFAULT_L2_TX_GAS_LIMIT,
    l2GasPerPubdataByteLimit: REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
    factoryDeps: [],
    refundRecipient,
  };
  const l1Calldata = BRIDGEHUB_ABI.encodeFunctionData(
    "requestL2TransactionDirect",
    [params],
  );

  return {
    to: L1_BRIDGE_HUB_ADDRESS,
    function: "requestL2TransactionDirect",
    params,
    l1_raw_calldata: l1Calldata,
    value: neededValue.toString(),
    gas_price: gasPrice,
  };
}

export function constructMerkleTree(
  addresses: string[][],
  l1SmartContractAddresses: string[][],
) {
  for (let i = 0; i < addresses.length; i++) {
    for (let j = 0; j < l1SmartContractAddresses.length; j++) {
      if (
        addresses[i]?.[0]?.toLowerCase() ==
        l1SmartContractAddresses[j]?.[0]?.toLowerCase()
      ) {
        addresses[i]![0] = utils.applyL1ToL2Alias(addresses[i]![0]!);
        break;
      }
    }
  }

  const leaves = addresses
    .map((allocation, i) => {
      if (allocation[0] && isAddress(allocation[0])) {
        return {
          address: allocation[0],
          amount: allocation[1],
          index: i,
          hashBuffer: Buffer.from(
            solidityPackedKeccak256(
              ["uint256", "address", "uint256"],
              [i, allocation[0], allocation[1]],
            ).replace("0x", ""),
            "hex",
          ),
        };
      }
      return null;
    })
    .filter((allocation) => allocation !== null) as {
    address: string;
    amount: string;
    index: number;
    hashBuffer: Buffer;
  }[];

  const leavesBuffs = leaves.sort((a, b) =>
    Buffer.compare(a.hashBuffer, b.hashBuffer),
  );
  const tree = new MerkleTree(
    leavesBuffs.map((leaf) => leaf.hashBuffer),
    ethers.keccak256,
    { sortPairs: true },
  );

  return { leaves: leavesBuffs, tree };
}
