"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAccount, useWriteContract } from "wagmi";
import { Account, WalletOptions } from "@/composed/Connect";
import { BRIDGE_HUB_ABI } from "public/abi/BRIDGE_HUB_ABI";
import { Tip } from "@/composed/Tip";
import EnsInputField from "@/composed/EnsInputField";
import { useEns } from "@/hooks/useEns";
import { Label } from "@/components/ui/label";
import { getDefaultProvider, JsonRpcProvider } from "ethers";
import { parseUnits } from "ethers";
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

  const [command, setCommand] = useState("generate-l1-contract-claim-tx");
  const [l1GasPrice, setL1GasPrice] = useState("");
  const [l1JsonRpc, setL1JsonRpc] = useState("https://eth.llamarpc.com");
  const [error, setError] = useState("");
  const [callData, setCallData] = useState<{
    function: string;
    gas_price: string;
    l1_raw_calldata: string;
    value: string;
    params: CallData;
  } | null>(null);

  console.log("🚀 ~ callData:", callData);
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
          [
            callData.params.chainId,
            callData.params.mintValue,
            callData.params.l2Contract,
            callData.params.l2Value,
            callData.params.l2Calldata,
            callData.params.l2GasLimit,
            callData.params.l2GasPerPubdataByteLimit,
            callData.params.factoryDeps,
            callData.params.refundRecipient,
          ],
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
        const gasPrice = parseUnits(l1GasPrice, "gwei").toString();
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
        console.log(finalData);
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-500 px-4 py-8">
      <div className="flex max-w-2xl flex-col gap-8">
        {" "}
        <ConnectWallet />
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
          <h1 className="mb-6 text-center text-3xl font-bold">
            Claim Your Airdrop
          </h1>
          <p className="mb-8 text-center text-gray-600">
            Enter your Ethereum address below to claim your airdrop.
          </p>
          <form onSubmit={handleGenerateClaimData}>
            <div className="mb-6 flex w-full flex-col items-end gap-4">
              <EnsInputField
                disabled={false}
                placeholder="Eligibility Address"
                rawTokenAddress={address}
                isValidToAddress={isValidEligibilityAddress}
                ensAddy={ensEligibilityAddy as string}
                ensAvatar={ensEligibilityAvatar!}
                onChange={handleEligibilityToAddressInput}
              />
              {/* checkbox to enable/disable otherRecipient */}
              <div className="mb-4 flex w-full flex-col items-start gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="checkbox"
                    id="otherRecipient"
                    name="otherRecipient"
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
              <Input
                type="text"
                placeholder="L1 Gas Price"
                value={l1GasPrice}
                onChange={(e) => setL1GasPrice(e.target.value)}
                className="min-h-10 rounded-l-md border-r-0 px-4 py-2 focus:border-indigo-500 focus:ring-indigo-500"
              />
              <Button
                disabled={loading || !l1GasPrice || !address}
                type="submit"
                className="rounded-r-md"
              >
                Create claim data
              </Button>
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
        <Tip />
      </div>
      {/* 
example raw data value:
{call_to_claim: {      
function
: 
"requestL2TransactionDirect"
gas_price
: 
"10000000000"
l1_raw_calldata
: 
"0xd52471c1000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001440000000000000000000000000000000000000000000000000002cb417800000000000000000000000000000066fd4fc8fa52c9bec2aba368047a0b27e24ecfe4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000032000000000000000000000000000000000000000000000000000000000000004600000000000000000000000008799198df84e5dd8d788adbb3e986a222e3dd7140000000000000000000000000000000000000000000000000000000000000304ae0b51df00000000000000000000000000000000000000000000000000000000000a8a410000000000000000000000000000000000000000000001d8c42ffe2965a40000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000149325fff7c4dc5f76b3c8f2e22fc8a5f298f22c3ecfd8188246a4333bf87efc6b3ac3c0bf2974f1ea7fbee195eb4a6a6e22a81da3e75751418ac8cc071872b566beea53f8f79591e9680506e3718ce3add065ccbd5bfeb90026d9f0bceffaabd93c24840f6d9a50bf9fa35343a3462241131bd14eb958a9587bd487b77c39f9e95baf43722cbcce672c92d850de2da5cedfbb7d41ef25900ad53d64f92fe3ade434309d39b886c188f6fcd910d533d93d85ba6d52e0ebc443203d12111d3d5f747b8f806546702a59cb3f09f5c2365908e2644740fc76bd799c4fbb3fd7f68850cc87af007c8e91d212c040387a2c104de7767504fc5cf4f0c7ad0c46187048ce2cb2dde11c69094b552b940b528a7c19238964402b625765b9d478f97959cca26ce32d85bde46bed444164687d545403712147bb64a1a4f634569d042857fbac6b4def9e94a5c4c824f8ada306de9549b97fb06b335f91b108f04227e8dcf3eb7472c9ca572f8fbc1d304a9d942cc1d830330a2770075d8f67986408e39510613a9408a0e60b9fa2e5219a3b5454a32da71053029a380771a9536ac786a8edc804f832ef8b0243b46e74507bbcbba75bb91049941d425bbba811cc32c6a4b370252513e0b65be32b6e2ffe0af07e341b95def50382c5946470980ae2023ed3ad11347a8f8b1bda4ec7da682a020287632b19b88bdef26cbe965f8145aea2e819e90813dec1a3d3c68812b0309d8dba9ac35689c0dc55538c0c1d746873a6e634510933c8234aea23efa7ee605057e8ff2972de23f3f3369b7017387c78ad4104226cff90d6b82409d4714cbba720aa0c11330c8763ff07093c8cf05f5034b64e74e8aa65670c322311dbc3a190daeba1b30b221ec0a2731cda27785942070bd9000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
params
: 
{chainId: 324, mintValue: "786432000000000", l2Contract: "0x66Fd4FC8FA52c9bec2AbA368047A0b27e24ecfe4",…}
chainId
: 
324
factoryDeps
: 
[]
l2Calldata
: 
"0xae0b51df00000000000000000000000000000000000000000000000000000000000a8a410000000000000000000000000000000000000000000001d8c42ffe2965a40000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000149325fff7c4dc5f76b3c8f2e22fc8a5f298f22c3ecfd8188246a4333bf87efc6b3ac3c0bf2974f1ea7fbee195eb4a6a6e22a81da3e75751418ac8cc071872b566beea53f8f79591e9680506e3718ce3add065ccbd5bfeb90026d9f0bceffaabd93c24840f6d9a50bf9fa35343a3462241131bd14eb958a9587bd487b77c39f9e95baf43722cbcce672c92d850de2da5cedfbb7d41ef25900ad53d64f92fe3ade434309d39b886c188f6fcd910d533d93d85ba6d52e0ebc443203d12111d3d5f747b8f806546702a59cb3f09f5c2365908e2644740fc76bd799c4fbb3fd7f68850cc87af007c8e91d212c040387a2c104de7767504fc5cf4f0c7ad0c46187048ce2cb2dde11c69094b552b940b528a7c19238964402b625765b9d478f97959cca26ce32d85bde46bed444164687d545403712147bb64a1a4f634569d042857fbac6b4def9e94a5c4c824f8ada306de9549b97fb06b335f91b108f04227e8dcf3eb7472c9ca572f8fbc1d304a9d942cc1d830330a2770075d8f67986408e39510613a9408a0e60b9fa2e5219a3b5454a32da71053029a380771a9536ac786a8edc804f832ef8b0243b46e74507bbcbba75bb91049941d425bbba811cc32c6a4b370252513e0b65be32b6e2ffe0af07e341b95def50382c5946470980ae2023ed3ad11347a8f8b1bda4ec7da682a020287632b19b88bdef26cbe965f8145aea2e819e90813dec1a3d3c68812b0309d8dba9ac35689c0dc55538c0c1d746873a6e634510933c8234aea23efa7ee605057e8ff2972de23f3f3369b7017387c78ad4104226cff90d6b82409d4714cbba720aa0c11330c8763ff07093c8cf05f5034b64e74e8aa65670c322311dbc3a190daeba1b30b221ec0a2731cda27785942070bd9"
l2Contract
: 
"0x66Fd4FC8FA52c9bec2AbA368047A0b27e24ecfe4"
l2GasLimit
: 
2097152
l2GasPerPubdataByteLimit
: 
800
l2Value
: 
0
mintValue
: 
"786432000000000"
refundRecipient
: 
"0x8799198df84e5dd8d788adbb3e986a222e3dd714"
to
: 
"0x303a465B659cBB0ab36eE643eA362c509EEb5213"
value
: 
"786432000000000" } */}
      {Object.keys(rawData).length > 0 ? (
        <div className="mt-8 w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
          <h2 className="mb-6 text-center text-3xl font-bold">Claim Data</h2>
          {Object.entries(rawData).map(([key, value]) => (
            <div key={key} className="mb-4">
              <p className="text-gray-500">{key}</p>
              <pre className="break-after-all rounded-md bg-gray-100 p-2 text-xs text-gray-800">
                {JSON.stringify(value, null, 2)}
              </pre>
            </div>
          ))}

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
