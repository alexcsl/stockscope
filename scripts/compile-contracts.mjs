import fs from "node:fs";
import path from "node:path";
import solc from "solc";

export function compileContracts(includeTests = false) {
  const files = fs.readdirSync("contracts").filter((file) => file.endsWith(".sol"));
  if (includeTests) files.push("test/Mocks.sol");
  const sources = Object.fromEntries(files.map((file) => [`contracts/${file}`, { content: fs.readFileSync(`contracts/${file}`, "utf8") }]));
  const output = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources, settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "shanghai", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } } } }), { import: (file) => {
    const resolved = file.startsWith("@") ? path.join("node_modules", file) : file;
    return fs.existsSync(resolved) ? { contents: fs.readFileSync(resolved, "utf8") } : { error: `Missing import ${file}` };
  } }));
  const errors = (output.errors || []).filter((error) => error.severity === "error");
  if (errors.length) throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
  return output.contracts;
}

if (process.argv[1]?.endsWith("compile-contracts.mjs")) {
  const contracts = compileContracts();
  fs.mkdirSync("artifacts", { recursive: true });
  for (const [file, entries] of Object.entries(contracts)) {
    if (!file.startsWith("contracts/")) continue;
    for (const [name, contract] of Object.entries(entries)) fs.writeFileSync(`artifacts/${name}.json`, JSON.stringify(contract, null, 2));
  }
  console.log(`Compiled StockScope contracts with solc ${solc.version()}`);
}
