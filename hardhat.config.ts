import { defineConfig } from "hardhat/config";

export default defineConfig({
  networks: {
    local: { type: "edr-simulated", chainId: 31337, hardfork: "shanghai" },
    arbitrumDemo: { type: "edr-simulated", chainId: 421614, hardfork: "shanghai" },
    robinhoodDemo: { type: "edr-simulated", chainId: 46630, hardfork: "shanghai" },
  },
});
