/**
 * Contract Size Analysis Script
 * Reports the bytecode size of compiled contracts
 * 
 * Ethereum mainnet limit: 24,576 bytes (24KB)
 */

const fs = require("fs");
const path = require("path");

const CONTRACTS = [
  "GovernanceToken",
  "DAOGovernor",
  "Treasury"
];

const MAX_CONTRACT_SIZE = 24576; // bytes

function getContractSize(contractName) {
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    `${contractName}.sol`,
    `${contractName}.json`
  );
  
  if (!fs.existsSync(artifactPath)) {
    return null;
  }
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const bytecode = artifact.deployedBytecode;
  
  // Remove '0x' prefix and divide by 2 (2 hex chars = 1 byte)
  const sizeBytes = (bytecode.length - 2) / 2;
  
  return {
    name: contractName,
    sizeBytes,
    sizeKB: (sizeBytes / 1024).toFixed(2),
    percentOfLimit: ((sizeBytes / MAX_CONTRACT_SIZE) * 100).toFixed(1),
    underLimit: sizeBytes <= MAX_CONTRACT_SIZE
  };
}

function main() {
  console.log("\n" + "=".repeat(60));
  console.log("CONTRACT SIZE ANALYSIS");
  console.log("=".repeat(60));
  console.log(`\nEthereum contract size limit: ${MAX_CONTRACT_SIZE} bytes (24 KB)\n`);
  
  let allUnderLimit = true;
  
  for (const contract of CONTRACTS) {
    const size = getContractSize(contract);
    
    if (!size) {
      console.log(`  ${contract}: Not found (run npm run compile first)`);
      continue;
    }
    
    const status = size.underLimit ? "OK" : "EXCEEDED";
    const statusIcon = size.underLimit ? "OK" : "EXCEEDED";
    
    console.log(`  ${contract}:`);
    console.log(`    Size: ${size.sizeBytes} bytes (${size.sizeKB} KB)`);
    console.log(`    Usage: ${size.percentOfLimit}% of limit`);
    console.log(`    Status: [${statusIcon}]`);
    console.log("");
    
    if (!size.underLimit) {
      allUnderLimit = false;
    }
  }
  
  console.log("=".repeat(60));
  
  if (allUnderLimit) {
    console.log("All contracts are within the size limit!");
  } else {
    console.log("WARNING: Some contracts exceed the size limit!");
    process.exit(1);
  }
  
  console.log("=".repeat(60) + "\n");
}

main();
