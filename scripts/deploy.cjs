const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * DAO Governance Platform Deployment Script
 * 
 * Deploys three interconnected contracts:
 * 1. GovernanceToken (DGT) - ERC-20 with ERC20Votes for delegation
 * 2. Treasury - TimelockController with spending limits
 * 3. DAOGovernor - OpenZeppelin Governor with quadratic voting
 * 
 * @author MHD-Amini
 * @version 1.0.0
 */

// Deployment Configuration
const CONFIG = {
  token: {
    name: "DAO Governance Token",
    symbol: "DGT",
    maxSupply: "10000000" // 10 million tokens
  },
  treasury: {
    minDelay: 86400, // 1 day timelock (24 * 60 * 60 seconds)
    dailyLimit: "100", // 100 ETH
    weeklyLimit: "500" // 500 ETH
  },
  governance: {
    votingDelay: 7200, // ~1 day (12s blocks)
    votingPeriod: 50400, // ~7 days
    proposalThreshold: "1000" // 1,000 DGT minimum to propose
  }
};

/**
 * Validates deployer has sufficient balance
 */
async function validateDeployer(deployer) {
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const minBalance = hre.ethers.parseEther("0.1"); // Minimum 0.1 ETH for deployment
  
  if (balance < minBalance) {
    throw new Error(`Insufficient balance. Required: 0.1 ETH, Available: ${hre.ethers.formatEther(balance)} ETH`);
  }
  
  return balance;
}

/**
 * Deploys GovernanceToken contract
 */
async function deployGovernanceToken(maxSupply) {
  console.log("1️⃣  Deploying GovernanceToken...");
  
  const GovernanceToken = await hre.ethers.getContractFactory("GovernanceToken");
  const governanceToken = await GovernanceToken.deploy(
    CONFIG.token.name,
    CONFIG.token.symbol,
    maxSupply
  );
  
  await governanceToken.waitForDeployment();
  const address = await governanceToken.getAddress();
  
  console.log("   ✅ GovernanceToken deployed to:", address);
  console.log("   📊 Max Supply:", hre.ethers.formatEther(maxSupply), "DGT");
  
  return { contract: governanceToken, address };
}

/**
 * Deploys Treasury contract
 */
async function deployTreasury(deployer, dailyLimit, weeklyLimit) {
  console.log("\n2️⃣  Deploying Treasury...");
  
  const Treasury = await hre.ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(
    CONFIG.treasury.minDelay,
    [deployer.address], // proposers (initially deployer, later governor)
    [deployer.address], // executors (initially deployer, later governor)
    deployer.address,   // admin
    dailyLimit,
    weeklyLimit
  );
  
  await treasury.waitForDeployment();
  const address = await treasury.getAddress();
  
  console.log("   ✅ Treasury deployed to:", address);
  console.log("   🔒 Timelock Delay:", CONFIG.treasury.minDelay / 3600, "hours");
  console.log("   💰 Daily Limit:", hre.ethers.formatEther(dailyLimit), "ETH");
  console.log("   💰 Weekly Limit:", hre.ethers.formatEther(weeklyLimit), "ETH");
  
  return { contract: treasury, address };
}

/**
 * Deploys DAOGovernor contract
 */
async function deployGovernor(tokenAddress, treasuryAddress, guardian) {
  console.log("\n3️⃣  Deploying DAOGovernor...");
  
  const DAOGovernor = await hre.ethers.getContractFactory("DAOGovernor");
  const governor = await DAOGovernor.deploy(
    tokenAddress,
    treasuryAddress,
    guardian
  );
  
  await governor.waitForDeployment();
  const address = await governor.getAddress();
  
  console.log("   ✅ DAOGovernor deployed to:", address);
  console.log("   🛡️  Guardian:", guardian);
  console.log("   ⏱️  Voting Delay:", CONFIG.governance.votingDelay, "blocks (~1 day)");
  console.log("   ⏱️  Voting Period:", CONFIG.governance.votingPeriod, "blocks (~7 days)");
  
  return { contract: governor, address };
}

/**
 * Configures contract relationships and grants roles
 */
async function configureContracts(governanceToken, treasury, governorAddress, treasuryAddress) {
  console.log("\n4️⃣  Configuring contracts...");
  
  // Set timelock in governance token
  const setTimelockTx = await governanceToken.setTimelock(treasuryAddress);
  await setTimelockTx.wait();
  console.log("   ✅ Timelock set in GovernanceToken");
  
  // Grant roles to governor in treasury
  const PROPOSER_ROLE = await treasury.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await treasury.EXECUTOR_ROLE();
  const CANCELLER_ROLE = await treasury.CANCELLER_ROLE();
  
  const grantProposerTx = await treasury.grantRole(PROPOSER_ROLE, governorAddress);
  await grantProposerTx.wait();
  console.log("   ✅ Governor granted PROPOSER_ROLE");
  
  const grantExecutorTx = await treasury.grantRole(EXECUTOR_ROLE, governorAddress);
  await grantExecutorTx.wait();
  console.log("   ✅ Governor granted EXECUTOR_ROLE");
  
  const grantCancellerTx = await treasury.grantRole(CANCELLER_ROLE, governorAddress);
  await grantCancellerTx.wait();
  console.log("   ✅ Governor granted CANCELLER_ROLE");
}

/**
 * Mints initial tokens to deployer
 */
async function mintInitialTokens(governanceToken, deployer) {
  console.log("\n5️⃣  Minting initial tokens...");
  
  // Mint Founder tier tokens to deployer
  const mintTx = await governanceToken.mintByTier(deployer.address, 4); // Founder tier
  await mintTx.wait();
  console.log("   ✅ Minted 100,000 DGT to deployer (Founder tier)");
  
  // Self-delegate to enable voting
  const delegateTx = await governanceToken.delegate(deployer.address);
  await delegateTx.wait();
  console.log("   ✅ Deployer self-delegated voting power");
  
  // Verify voting power
  const votingPower = await governanceToken.getVotes(deployer.address);
  console.log("   📊 Deployer voting power:", hre.ethers.formatEther(votingPower), "DGT");
}

/**
 * Saves deployment addresses to JSON file
 */
function saveDeploymentAddresses(addresses, network) {
  const deploymentPath = path.join(__dirname, "..", "deployments");
  
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }
  
  const filename = path.join(deploymentPath, `${network}-deployment.json`);
  const deploymentData = {
    network,
    timestamp: new Date().toISOString(),
    contracts: addresses,
    config: CONFIG
  };
  
  fs.writeFileSync(filename, JSON.stringify(deploymentData, null, 2));
  console.log(`\n   📁 Deployment saved to: ${filename}`);
}

/**
 * Main deployment function
 */
async function main() {
  console.log("\n" + "═".repeat(60));
  console.log("🚀 DAO GOVERNANCE PLATFORM DEPLOYMENT");
  console.log("═".repeat(60) + "\n");
  
  const network = hre.network.name;
  console.log("🌐 Network:", network);
  console.log("⏰ Timestamp:", new Date().toISOString());
  
  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("\n📍 Deployer:", deployer.address);
  
  // Validate deployer balance
  const balance = await validateDeployer(deployer);
  console.log("💰 Balance:", hre.ethers.formatEther(balance), "ETH\n");
  
  // Parse configuration values
  const maxSupply = hre.ethers.parseEther(CONFIG.token.maxSupply);
  const dailyLimit = hre.ethers.parseEther(CONFIG.treasury.dailyLimit);
  const weeklyLimit = hre.ethers.parseEther(CONFIG.treasury.weeklyLimit);
  
  // Deploy contracts
  const token = await deployGovernanceToken(maxSupply);
  const treasury = await deployTreasury(deployer, dailyLimit, weeklyLimit);
  const governor = await deployGovernor(token.address, treasury.address, deployer.address);
  
  // Configure contracts
  await configureContracts(token.contract, treasury.contract, governor.address, treasury.address);
  
  // Mint initial tokens
  await mintInitialTokens(token.contract, deployer);
  
  // Save deployment addresses
  const addresses = {
    governanceToken: token.address,
    treasury: treasury.address,
    governor: governor.address
  };
  
  saveDeploymentAddresses(addresses, network);
  
  // Print summary
  console.log("\n" + "═".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!");
  console.log("═".repeat(60));
  console.log("\n📋 CONTRACT ADDRESSES:");
  console.log("   GovernanceToken (DGT):", token.address);
  console.log("   Treasury:", treasury.address);
  console.log("   DAOGovernor:", governor.address);
  console.log("\n⚙️  CONFIGURATION:");
  console.log("   Max Token Supply:", CONFIG.token.maxSupply, "DGT");
  console.log("   Daily Spending Limit:", CONFIG.treasury.dailyLimit, "ETH");
  console.log("   Weekly Spending Limit:", CONFIG.treasury.weeklyLimit, "ETH");
  console.log("   Timelock Delay:", CONFIG.treasury.minDelay / 3600, "hours");
  console.log("   Voting Delay:", CONFIG.governance.votingDelay, "blocks");
  console.log("   Voting Period:", CONFIG.governance.votingPeriod, "blocks");
  console.log("\n👤 INITIAL SETUP:");
  console.log("   Deployer:", deployer.address);
  console.log("   Guardian:", deployer.address);
  console.log("   Deployer Tokens: 100,000 DGT (Founder tier)");
  console.log("═".repeat(60) + "\n");
  
  // Verification instructions for testnets/mainnet
  if (network !== "hardhat" && network !== "localhost") {
    console.log("📝 VERIFICATION COMMANDS:");
    console.log(`   npx hardhat verify --network ${network} ${token.address} "${CONFIG.token.name}" "${CONFIG.token.symbol}" "${maxSupply}"`);
    console.log(`   npx hardhat verify --network ${network} ${treasury.address} ${CONFIG.treasury.minDelay} [${deployer.address}] [${deployer.address}] ${deployer.address} "${dailyLimit}" "${weeklyLimit}"`);
    console.log(`   npx hardhat verify --network ${network} ${governor.address} ${token.address} ${treasury.address} ${deployer.address}`);
    console.log("");
  }
  
  return addresses;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ DEPLOYMENT FAILED:");
    console.error(error);
    process.exit(1);
  });
