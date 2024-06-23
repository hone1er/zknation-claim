"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAccount, useGasPrice, useWriteContract } from "wagmi";
import { Account, WalletOptions } from "@/composed/Connect";
import { BRIDGE_HUB_ABI } from "public/abi/BRIDGE_HUB_ABI";
import { Tip } from "@/composed/Tip";
import EnsInputField from "@/composed/EnsInputField";
import { useEns } from "@/hooks/useEns";
import { Label } from "@/components/ui/label";
import { getDefaultProvider, JsonRpcProvider } from "ethers";
import { utils } from "zksync-ethers";
import {
  constructMerkleTree,
  getL1TxInfo,
  getL2ClaimData,
  readCSVFromUrl,
} from "@/utils";

interface CallData {
  payableAmount: string; // ether

  chainId: number;
  mintValue: string;
  l2Contract: string;
  l2Value: number;
  l2Calldata: string;
  l2GasLimit: number;
  l2GasPerPubdataByteLimit: number;
  factoryDeps: string[];
  refundRecipient: string;
}

export default function Component() {
  const [eligibilityMessage, setEligibilityMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [rawData, setRawData] = useState({});
  const [otherRecipient, setOtherRecipient] = useState(false);
  const { data: l1GasPrice } = useGasPrice({ chainId: 1 });
  const [command, setCommand] = useState("generate-l1-contract-claim-tx");

  const [l1JsonRpc, setL1JsonRpc] = useState("https://eth.llamarpc.com");
  const [error, setError] = useState("");
  const [callData, setCallData] = useState<{
    function: string;
    gas_price: string;
    l1_raw_calldata: string;
    value: string;
    params: CallData;
  } | null>(null);

  const {
    rawTokenAddress: refundRecipient,
    isValidToAddress,
    ensAddy,
    ensAvatar,
    handleToAddressInput,
  } = useEns();
  const {
    rawTokenAddress: address,
    isValidToAddress: isValidEligibilityAddress,
    ensAddy: ensEligibilityAddy,
    ensAvatar: ensEligibilityAvatar,
    handleToAddressInput: handleEligibilityToAddressInput,
  } = useEns();
  const { writeContractAsync } = useWriteContract();

  async function handleClaim() {
    if (!callData) return;

    const result = await writeContractAsync(
      {
        address: "0x303a465B659cBB0ab36eE643eA362c509EEb5213",
        abi: BRIDGE_HUB_ABI,
        functionName: callData.function,
        args: [
          (callData.params.chainId,
          callData.params.mintValue,
          callData.params.l2Contract,
          callData.params.l2Value,
          callData.params.l2Calldata,
          callData.params.l2GasLimit,
          callData.params.l2GasPerPubdataByteLimit,
          callData.params.factoryDeps,
          callData.params.refundRecipient),
        ],
        value: BigInt(callData.value),
      },
      {
        onSuccess: (hash: string) => {
          alert(`Transaction sent. Hash: ${hash}`);
        },
        onError: (error: Error) => {
          alert(`Error: ${error.message}`);
        },
      },
    );
  }

  const handleGenerateClaimData = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setError("");
    setEligibilityMessage("");
    setLoading(true);
    try {
      const allocation = await readCSVFromUrl("/airdrop-allocations.csv");
      const l1EligibilityList = await readCSVFromUrl(
        "/l1_eligibility_list.csv",
      );
      const { leavesBuffs, tree } = constructMerkleTree(
        allocation,
        l1EligibilityList,
      );

      if (command === "generate-l2-contract-claim-tx") {
        const l2ClaimData = getL2ClaimData(
          tree,
          leavesBuffs.map(
            (buff) =>
              ({
                hashBuffer: buff.hashBuffer,
                address: buff.address,
                index: buff.index,
                amount: buff.amount,
              }) as unknown as {
                hashBuffer: Buffer;
                address: string;
                index: number;
                amount: number;
              },
          ),
          address,
          false,
        );
        setRawData(JSON.stringify(l2ClaimData));
      } else if (command === "generate-l1-contract-claim-tx") {
        if (!l1GasPrice) {
          setError("Missing required parameter: l1GasPrice");
          return;
        }
        const gasPrice = (l1GasPrice / 1000000000n + 1n).toString();

        const l1Provider = l1JsonRpc
          ? new JsonRpcProvider(l1JsonRpc)
          : getDefaultProvider("mainnet");

        const aliasedAddress = utils.applyL1ToL2Alias(address);
        const l2ClaimData = await getL2ClaimData(
          tree,
          leavesBuffs.map(
            (buff) =>
              ({
                hashBuffer: buff.hashBuffer,
                address: buff.address,
                index: buff.index,
                amount: buff.amount,
              }) as unknown as {
                hashBuffer: Buffer;
                address: string;
                index: number;
                amount: number;
              },
          ),
          aliasedAddress,
          true,
        );

        if (!l2ClaimData.call_to_claim) {
          setError("No claim found for the provided address");
          return;
        }

        const l1TxData = await getL1TxInfo(
          l1Provider,
          l2ClaimData.call_to_claim.to,
          l2ClaimData.call_to_claim.l2_raw_calldata,
          otherRecipient ? refundRecipient : address,
          gasPrice,
        );
        const finalData = {
          address,
          call_to_claim: l1TxData,
        };

        setRawData(finalData);
        setCallData(
          finalData.call_to_claim as unknown as {
            function: string;
            gas_price: string;
            l1_raw_calldata: string;
            value: string;
            params: CallData;
          },
        );
        setEligibilityMessage("Eligible for airdrop");
      } else {
        setError("Invalid command");
      }
    } catch (err) {
      setError((err as Error)?.message ?? "Internal Server Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-indigo-500 to-purple-500 px-4 py-8">
      <div className="flex max-w-2xl flex-col gap-8">
        {" "}
        <ConnectWallet />
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
          <h1 className="mb-6 text-center text-3xl font-bold">
            ZK Claim Helper
          </h1>

          <p className="mb-8 text-center text-gray-600">
            This UI was built to make claiming $ZK tokens from an L1 smart
            contract easier. Functionality follows this{" "}
            <a
              href="https://github.com/ZKsync-Association/zknation-data/blob/main/README.md#l1-smart-contracts-addresses"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 hover:underline"
            >
              ZKsync Association repository
            </a>{" "}
            to produce the call data for your claim. After generating the claim
            data you will be able to claim your tokens.
          </p>
          <p className="mb-8 text-center text-gray-600">
            Specifically made for the miladys and pengus to safely claim from
            their multisigs to another address{" "}
            <span className="text-xs">
              (but other eligible smart contract wallets can use this too!)
            </span>
          </p>
        </div>
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
          <h1 className="mb-6 text-center text-3xl font-bold">
            Generate your claim data
          </h1>
          <p className="mb-8 text-center text-gray-600">
            Enter your eligible L1 Ethereum address below to generate the claim
            data for your airdrop.
          </p>
          <form onSubmit={handleGenerateClaimData}>
            <div className="mb-6 flex w-full flex-col items-end gap-6">
              <div>
                <EnsInputField
                  disabled={false}
                  placeholder="Eligibility Address"
                  rawTokenAddress={address}
                  isValidToAddress={isValidEligibilityAddress}
                  ensAddy={ensEligibilityAddy as string}
                  ensAvatar={ensEligibilityAvatar!}
                  onChange={handleEligibilityToAddressInput}
                />
                <p className="text-xs text-gray-500">
                  If you have not deployed a smart contract wallet with the same
                  address on ZKsync, please enter an address that you own on
                  ZKsync as the recipient.
                </p>
              </div>
              {/* checkbox to enable/disable otherRecipient */}
              <div className="mb-4 flex w-full flex-col items-start gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="checkbox"
                    id="otherRecipient"
                    name="otherRecipient"
                    checked={otherRecipient}
                    className="h-4 w-4 "
                    onChange={(e) => setOtherRecipient(e.target.checked)}
                  />
                  <Label htmlFor="otherRecipient">Set recipient</Label>
                </div>
                {otherRecipient ? (
                  <EnsInputField
                    placeholder="Recipient Address"
                    disabled={false}
                    rawTokenAddress={refundRecipient}
                    isValidToAddress={isValidToAddress}
                    ensAddy={ensAddy as string}
                    ensAvatar={ensAvatar!}
                    onChange={handleToAddressInput}
                  />
                ) : null}
              </div>

              <Button
                disabled={
                  loading ||
                  !l1GasPrice ||
                  !address ||
                  !isValidEligibilityAddress ||
                  (otherRecipient && !isValidToAddress)
                }
                type="submit"
                className="rounded-r-md"
              >
                Create claim data
              </Button>
              <p className="text-xs text-gray-500">
                UI may become unresponsive while generating claim data. Please
                allow 1-2 minutes for the data to be generated.
              </p>
            </div>
            {error ? (
              <p className="mb-4 text-center text-xs text-red-500">{error}</p>
            ) : null}
          </form>

          {/* <p className="text-center text-sm text-gray-500">
            By clicking &apos;Claim&apos;, you agree to our{" "}
            <Link
              href="#"
              className="text-indigo-500 hover:underline"
              prefetch={false}
            >
              terms and conditions
            </Link>
            .
          </p> */}
          {eligibilityMessage && (
            <p className="text-center text-green-500">{eligibilityMessage}</p>
          )}
        </div>
      </div>
      <div className="w-full max-w-md justify-start">
        <Tip />
      </div>
      {Object.keys(rawData).length > 0 ? (
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
          <h1 className="mb-6 text-center text-3xl font-bold">
            Claim your ZK tokens
          </h1>
          <div className="mt-8 w-full max-w-md rounded-lg bg-white p-8 ">
            <h2 className="mb-6 text-left text-2xl font-semibold">
              Claim Data
            </h2>
            {Object.entries(rawData).map(([key, value]) => (
              <div key={key} className="mb-4">
                <p className="text-gray-500">{key}</p>
                <pre className="break-after-all rounded-md bg-gray-100 p-2 text-xs text-gray-800">
                  {JSON.stringify(value, null, 2)}
                </pre>
              </div>
            ))}
          </div>
          <Button onClick={handleClaim}>Claim</Button>
        </div>
      ) : null}
    </div>
  );
}
function ConnectWallet() {
  const { isConnected } = useAccount();
  if (isConnected) return <Account />;
  return <WalletOptions />;
}
