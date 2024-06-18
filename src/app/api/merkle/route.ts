import { getDefaultProvider, JsonRpcProvider } from "ethers";
import {
  constructMerkleTree,
  readCSV,
  getL1TxInfo,
  getL2ClaimData,
} from "../../../utils";
import { parseUnits } from "ethers";
import { utils } from "zksync-ethers";

export async function POST(req: Request) {
  if (!req.body) return;
  const body = (await req.json()) as {
    command: string;
    address: string;
    l1GasPrice: string;
    l1JsonRpc: string;
  };
  const { command, address, l1GasPrice, l1JsonRpc } = body;

  try {
    const allocation = await readCSV("/airdrop-allocations.csv");
    const l1EligibilityList = await readCSV("/l1_eligibility_list.csv");
    const { leavesBuffs, tree } = constructMerkleTree(
      allocation,
      l1EligibilityList,
    );

    if (command === "generate-l2-contract-claim-tx") {
      const l2ClaimData = getL2ClaimData(
        tree,
        leavesBuffs as unknown as {
          hashBuffer: Buffer;
          address: string;
          index: number;
          amount: number;
        }[],
        address,
        false,
      );
      return new Response(JSON.stringify(l2ClaimData));
    } else if (command === "generate-l1-contract-claim-tx") {
      if (!l1GasPrice) {
        return new Response(
          JSON.stringify({
            error: "Missing required parameter: l1GasPrice",
          }),
          { status: 400 },
        );
      }
      const gasPrice = parseUnits(l1GasPrice, "gwei").toString();
      const l1Provider = l1JsonRpc
        ? new JsonRpcProvider(l1JsonRpc)
        : getDefaultProvider("mainnet");

      const aliasedAddress = utils.applyL1ToL2Alias(address);
      const l2ClaimData = await getL2ClaimData(
        tree,
        leavesBuffs as unknown as {
          hashBuffer: Buffer;
          address: string;
          index: number;
          amount: number;
        }[],
        aliasedAddress,
        true,
      );
      if (!l2ClaimData.call_to_claim) {
        return new Response(
          JSON.stringify({
            error: "No claim found for the provided address",
          }),
          { status: 400 },
        );
      }

      const l1TxData = await getL1TxInfo(
        l1Provider,
        l2ClaimData.call_to_claim.to,
        l2ClaimData.call_to_claim.l2_raw_calldata,
        address,
        gasPrice,
      );
      const finalData = {
        address,
        call_to_claim: l1TxData,
      };
      return new Response(JSON.stringify(finalData));
    } else {
      return new Response(JSON.stringify({ error: "Invalid command" }), {
        status: 400,
      });
    }
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({
        error: (err as Error)?.message ?? "Internal Server Error",
      }),
      { status: 500 },
    );
  }
}
