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
  REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
  ZKSYNC_ERA_CHAIN_ID,
} from "./contants";
import { BRIDGEHUB_ABI } from "zksync-ethers/build/utils";
import { type BigNumberish } from "ethers";
import { utils } from "zksync-ethers";

export async function readCSVFromUrl(url: string): Promise<string[][]> {
  const response = await fetch(url);
  const data = await response.text();

  return parse(data, { columns: false });
}

export async function getL2ClaimData(
  tree: MerkleTree,
  leaves: {
    hashBuffer: Buffer;
    address: string;
    index: number;
    amount: number;
  }[],
  address: string,
  isL1: boolean,
) {
  let found = false;
  let leaf:
    | {
        hashBuffer: Buffer;
        address: string;
        index: number;
        amount: number;
      }
    | undefined;

  for (const l of leaves) {
    if (l.address.toLowerCase() == address.toLowerCase()) {
      found = true;
      leaf = l;
      break;
    }
  }

  if (!found) {
    throw new Error(
      `${isL1 ? utils.undoL1ToL2Alias(address) : address} address is not eligible`,
    );
  }

  const merkleProof = tree.getHexProof(leaf!.hashBuffer as string | Buffer); //   const merkleProof = tree.getHexProof(leaf.hashBuffer);

  return {
    address: leaf?.address,
    call_to_claim: {
      to: L2_MERKLE_DISTRIBUTOR_ADDRESS,
      function: "claim",
      params: {
        index: leaf?.index,
        amount: leaf?.amount,
        merkle_proof: merkleProof,
      },
      l2_raw_calldata: L2_MERKLE_DISTRIBUTOR_INTERFACE.encodeFunctionData(
        "claim",
        [leaf?.index, leaf?.amount, merkleProof],
      ),
    },
  };
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
  if (!bridgeHub.l2TransactionBaseCost) return;
  const neededValue = (await bridgeHub.l2TransactionBaseCost(
    ZKSYNC_ERA_CHAIN_ID,
    gasPrice,
    DEFAULT_L2_TX_GAS_LIMIT,
    REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
  )) as string;
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

  console.log("🚀 ~ addresses:", addresses);
  const leaves = addresses.map((allocation, i) => ({
    hashBuffer: Buffer.from(
      solidityPackedKeccak256(
        ["uint256", "address", "uint256"],
        [i, allocation[0], allocation[1]],
      ).replace("0x", ""),
      "hex",
    ),
    address: allocation[0],
    index: i,
    amount: allocation[1],
  }));

  const leavesBuffs = leaves.sort((a, b) =>
    Buffer.compare(a.hashBuffer, b.hashBuffer),
  );
  const tree = new MerkleTree(
    leavesBuffs.map((leaf) => leaf.hashBuffer),
    ethers.keccak256,
    { sortPairs: true },
  );

  return { leavesBuffs, tree };
}
