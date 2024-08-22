"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAccount, useGasPrice, useWriteContract } from "wagmi";
import { Account, WalletOptions } from "@/composed/Connect";

import { Tip } from "@/composed/Tip";
import EnsInputField from "@/composed/EnsInputField";
import { useEns } from "@/hooks/useEns";
import { Label } from "@/components/ui/label";
import {
  BigNumberish,
  ethers,
  getDefaultProvider,
  JsonRpcProvider,
} from "ethers";
import { utils } from "zksync-ethers";

import {
  getL1TxInfo,
  getL2ClaimData,
  getL2TransferData,
  readAllocationsAndL1EligibilityLists,
} from "@/utils";
import { BRIDGE_HUB_ABI } from "public/abi/BRIDGE_HUB_ABI";
import {
  ALL_ADDRESSES_ALLOCATION_PATHES,
  L1_ADDRESSES_ALLOCATION_PATHES,
  L2_MERKLE_DISTRIBUTOR_ADDRESSES,
} from "@/contants";
import { zeroAddress } from "viem";

interface CallData {
  chainId: number;
  mintValue: string;
  l2Contract: string;
  l2Value: number;
  l2Calldata: string;
  l2GasLimit: number;
  l2GasPerPubdataByteLimit: number;
  factoryDeps: string[] | never[];
  refundRecipient: string;
}

export default function Component() {
  const [eligibilityMessage, setEligibilityMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [rawData, setRawData] = useState({});
  const [otherRecipient, setOtherRecipient] = useState(false);
  const { data: l1GasPrice } = useGasPrice({ chainId: 1 });

  const [l1JsonRpc, setL1JsonRpc] = useState("https://eth.llamarpc.com");
  const [error, setError] = useState("");
  const [callData, setCallData] = useState<{
    function: string;
    gas_price: BigNumberish | string;
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
    if (!l1GasPrice) {
      setError("Missing required parameter: l1GasPrice");
      return;
    }
    console.log("🚀 ~ handleClaim ~ callData:", callData);

    const result = await writeContractAsync(
      {
        address: "0x303a465B659cBB0ab36eE643eA362c509EEb5213",
        abi: BRIDGE_HUB_ABI,
        functionName: callData.function as "requestL2TransactionDirect",
        args: [
          {
            chainId: BigInt(callData.params.chainId),
            mintValue: BigInt(callData.params.mintValue),
            l2Contract: callData.params.l2Contract as `0x${string}`,
            l2Value: BigInt(callData.params.l2Value),
            l2Calldata: callData.params.l2Calldata as `0x${string}`,
            l2GasLimit: BigInt(callData.params.l2GasLimit),
            l2GasPerPubdataByteLimit: BigInt(
              callData.params.l2GasPerPubdataByteLimit,
            ),
            factoryDeps: callData.params
              .factoryDeps as readonly `0x${string}`[],
            refundRecipient: callData.params.refundRecipient as `0x${string}`,
          },
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
    console.log("🚀 ~ handleClaim ~ result:", result);
  }

  const handleGenerateClaimData = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setError("");
    setEligibilityMessage("");
    setLoading(true);
    try {
      const allocations = await readAllocationsAndL1EligibilityLists(
        ALL_ADDRESSES_ALLOCATION_PATHES,
        L1_ADDRESSES_ALLOCATION_PATHES,
        L2_MERKLE_DISTRIBUTOR_ADDRESSES,
      );

      if (!l1GasPrice) {
        setError("Missing required parameter: l1GasPrice");
        return;
      }
      const gasPrice = (l1GasPrice + 20n).toString();

      const l1Provider = l1JsonRpc
        ? new JsonRpcProvider(l1JsonRpc)
        : getDefaultProvider("mainnet");

      const aliasedAddress = utils.applyL1ToL2Alias(address);
      const l2ClaimData = await getL2ClaimData(
        allocations,
        aliasedAddress,
        true,
      );

      if (!l2ClaimData?.calls_to_claim) {
        setError("No claim found for the provided address");
        return;
      }

      const calls_to_claim = await Promise.all(
        l2ClaimData.calls_to_claim.map(
          async (data: {
            to: string;
            l2_raw_calldata: string;
            params: CallData;
          }) =>
            await getL1TxInfo(
              l1Provider,
              data.to,
              data.l2_raw_calldata,
              address,
              gasPrice,
            ),
        ),
      );

      const finalData = {
        address,
        call_to_claim: calls_to_claim[0],
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
    } catch (err) {
      setError((err as Error)?.message ?? "Internal Server Error");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTransferData = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const gasPrice = l1GasPrice
        ? ethers.formatUnits(l1GasPrice + 20n, "gwei")
        : "";
      const l1Provider = l1JsonRpc
        ? new JsonRpcProvider(l1JsonRpc)
        : getDefaultProvider("mainnet");

      const l2TransferData = await getL2TransferData(
        refundRecipient,
        callData?.params.mintValue.toString() ?? "",
      );
      const l1TxData = await getL1TxInfo(
        l1Provider,
        l2TransferData.call_to_transfer.to,
        l2TransferData.call_to_transfer.l2_raw_calldata,
        zeroAddress,
        gasPrice,
      );

      const finalData = {
        refundRecipient,
        amount: callData?.params.mintValue,
        l1TxData,
      };

      setRawData(finalData);
      if (!l1TxData) {
        setError("No claim found for the provided address");
        return;
      }

      setCallData(l1TxData); // Adjust according to your state variables
      setEligibilityMessage("Transfer data generated successfully");
    } catch (err) {
      console.log("🚀 ~ Component ~ err:", err);
      setError("Internal Server Error");
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
                  address on ZKsync you will be able to transfer your tokens to
                  an address you own on ZKsync in the next step.
                </p>
              </div>

              <Button
                disabled={
                  loading ||
                  !l1GasPrice ||
                  !address ||
                  !isValidEligibilityAddress
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
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-center text-3xl font-bold">
          Generate your transfer data
        </h1>
        <p className="mb-8 text-center text-gray-600">
          Enter your eligible L1 Ethereum address below to generate the transfer
          data for your airdrop.
        </p>
        <form onSubmit={handleGenerateTransferData}>
          <div className="mb-6 flex w-full flex-col items-end gap-6">
            <div>
              <EnsInputField
                placeholder="Recipient Address"
                disabled={false}
                rawTokenAddress={refundRecipient}
                isValidToAddress={isValidToAddress}
                ensAddy={ensAddy as string}
                ensAvatar={ensAvatar!}
                onChange={handleToAddressInput}
              />
              <p className="text-xs text-gray-500">
                If you have not claimed your tokens yet please do so in the
                previous step. Then enter an address that you own on ZKsync as
                the recipient and click &apos;Create transfer data&apos;.
              </p>
            </div>

            <Button
              disabled={
                loading || !l1GasPrice || !address || !isValidEligibilityAddress
              }
              type="submit"
              className="rounded-r-md"
            >
              Create transfer data
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
      </div>
      <div className="w-full max-w-md justify-start">
        <Tip />
      </div>
      {Object.keys(rawData).length > 0 ? (
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
          <h1 className="mb-6 text-center text-3xl font-bold">
            {otherRecipient ? "Transfer" : "Claim"} your ZK tokens
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
