"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { isAddress } from "ethers";

export default function Component() {
  const [address, setAddress] = useState("");
  const [eligibilityMessage, setEligibilityMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCheckEligibility(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault(); // Prevent default form submission
    setLoading(true);

    if (!isAddress(address)) {
      alert("Invalid Ethereum address");
      return;
    }
    try {
      // Check eligibility via API or server-side function
      const result = await fetch("/api/merkle", {
        method: "POST",
        body: JSON.stringify({
          command: "generate-l1-contract-claim-tx",
          address,
          l1GasPrice: "10",
          l1JsonRpc: "https://mainnet.infura.io/v3/your-infura-id",
        }),
      });

      if (!result.ok) {
        alert("Address is not eligible for the airdrop");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const data = await result.json();
      setEligibilityMessage("Address is eligible for the airdrop");
      console.log(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-500 px-4 py-8">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-center text-3xl font-bold">
          Claim Your Airdrop
        </h1>
        <p className="mb-8 text-center text-gray-600">
          Enter your Ethereum address below to claim your airdrop.
        </p>
        <form onSubmit={handleCheckEligibility}>
          <div className="mb-6 flex items-center">
            <Input
              type="text"
              placeholder="Enter your Ethereum address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="flex-1 rounded-l-md border-r-0 focus:border-indigo-500 focus:ring-indigo-500"
            />
            <Button disabled={loading} type="submit" className="rounded-r-md">
              Claim
            </Button>
          </div>
        </form>
        <p className="text-center text-sm text-gray-500">
          By clicking &apos;Claim&apos;, you agree to our{" "}
          <Link
            href="#"
            className="text-indigo-500 hover:underline"
            prefetch={false}
          >
            terms and conditions
          </Link>
          .
        </p>
        {eligibilityMessage && (
          <p className="text-center text-green-500">{eligibilityMessage}</p>
        )}
      </div>
    </div>
  );
}
