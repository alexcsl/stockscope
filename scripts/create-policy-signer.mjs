import fs from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

fs.mkdirSync(".stockscope", { recursive: true });
const key = generatePrivateKey();
fs.writeFileSync(".stockscope/policy-signer.key", key, { flag: "wx", mode: 0o600 });
console.log(`Policy signer public address: ${privateKeyToAccount(key).address}`);
console.log("Private key saved only to ignored .stockscope/policy-signer.key. Keep it on this server and back it up securely.");
