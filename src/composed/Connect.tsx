"use client";
import Image from "next/image";
import * as React from "react";
import { Connector, useConnect } from "wagmi";
import { useAccount, useDisconnect, useEnsAvatar, useEnsName } from "wagmi";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { truncateAddress } from "@/app/utils/truncateAddress";

export function WalletOptions() {
  const { connectors, connect } = useConnect();

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button size="sm" className="place-self-end">
          Connect Wallet
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="space-y-8">
          <DrawerTitle className="place-self-center">
            Select wallet to connect
          </DrawerTitle>
          <DrawerDescription className="flex max-w-4xl flex-wrap justify-center gap-4 place-self-center">
            {connectors.map((connector: Connector) => (
              <Button
                className="min-w-60"
                size="sm"
                key={connector.uid}
                onClick={() => connect({ connector })}
              >
                {connector.name}
              </Button>
            ))}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <DrawerClose>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function Account() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });
  const { data: ensAvatar } = useEnsAvatar({ name: ensName! });

  return (
    <div className="flex w-full flex-col justify-end">
      <Button
        size="sm"
        className="min-w-40 place-self-end"
        onClick={() => disconnect()}
      >
        Disconnect
      </Button>
      <div className="flex items-center gap-4">
        {ensAvatar && (
          <div className="relative h-12 w-12 overflow-hidden rounded-full md:h-16 md:w-16">
            <Image alt="ENS Avatar" fill src={ensAvatar} />
          </div>
        )}
        {address && (
          <div>
            {ensName ? `${ensName} (${truncateAddress(address)})` : address}
          </div>
        )}
      </div>
    </div>
  );
}
