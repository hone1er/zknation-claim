"use client";

import { createWeb3Modal } from "@web3modal/wagmi/react";
import { type State, WagmiProvider, createConfig, http } from "wagmi";
import {
  arbitrum,
  base,
  baseSepolia,
  mainnet,
  polygon,
  polygonAmoy,
} from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren } from "react";
import {
  coinbaseWallet,
  injected,
  metaMask,
  safe,
  walletConnect,
} from "wagmi/connectors";

interface Props extends PropsWithChildren {
  initialState?: State;
}
// 0. Setup queryClient
const queryClient = new QueryClient();

const chains = [
  baseSepolia,
  base,
  polygon,
  polygonAmoy,
  mainnet,
  arbitrum,
] as const;
// const config = defaultWagmiConfig({
//   chains,
//   projectId: projectId,
//   metadata,
//   ssr: true,
// });
const config = createConfig({
  chains,
  connectors: [
    coinbaseWallet({
      appName: "Honefolio",
      chainId: baseSepolia.id,
    }),
    injected(),
    metaMask(),
    safe(),
  ],
  ssr: true,
  transports: {
    [polygon.id]: http(),
    [polygonAmoy.id]: http(),
    [baseSepolia.id]: http(),
    [base.id]: http(),
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
  },
});

// 3. Create moda

export function Web3Provider({ initialState, children }: Props) {
  return (
    <WagmiProvider initialState={initialState} config={config}>
      <QueryClientProvider client={queryClient}>
        {/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment  */}
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
