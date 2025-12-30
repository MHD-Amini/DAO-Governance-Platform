const hre = require("hardhat");

async function main() {
  console.log("🚀 Starting DAO Governance Platform Deployment...\n");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("📍 Deploying contracts with account:", deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Configuration
  const MAX_SUPPLY = hre.ethers.parseEther("10000000"); // 10 million tokens
  const DAILY_LIMIT = hre.ethers.parseEther("100"); // 100 ETH
  const WEEKLY_LIMIT = hre.ethers.parseEther("500"); // 500 ETH
  const MIN_DELAY = 86400; // 1 day timelock (24 * 60 * 60)

  // Step 1: Deploy Governance Token
  console.log("1️⃣  Deploying GovernanceToken...");
  const GovernanceToken = await hre.ethers.getContractFactory("GovernanceToken");
  const governanceToken = await GovernanceToken.deploy(
    "DAO Governance Token",
    "DGT",
    MAX_SUPPLY
  );
  await governanceToken.waitForDeployment();
  const tokenAddress = await governanceToken.getAddress();
  console.log("   ✅ GovernanceToken deployed to:", tokenAddress);

  // Step 2: Deploy Treasury (TimelockController)
  console.log("\n2️⃣  Deploying Treasury...");
  const Treasury = await hre.ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(
    MIN_DELAY,
    [deployer.address], // proposers
    [deployer.address], // executors
    deployer.address,   // admin
    DAILY_LIMIT,
    WEEKLY_LIMIT
  );
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log("   ✅ Treasury deployed to:", treasuryAddress);

  // Step 3: Deploy Governor
  console.log("\n3️⃣  Deploying DAOGovernor...");
  const DAOGovernor = await hre.ethers.getContractFactory("DAOGovernor");
  const governor = await DAOGovernor.deploy(
    tokenAddress,
    treasuryAddress,
    deployer.address // Guardian (deployer for now)
  );
  await governor.waitForDeployment();
  const governorAddress = await governor.getAddress();
  console.log("   ✅ DAOGovernor deployed to:", governorAddress);

  // Step 4: Configure contracts
  console.log("\n4️⃣  Configuring contracts...");
  
  // Set timelock in governance token
  const setTimelockTx = await governanceToken.setTimelock(treasuryAddress);
  await setTimelockTx.wait();
  console.log("   ✅ Timelock set in GovernanceToken");

  // Grant roles to governor in treasury
  const PROPOSER_ROLE = await treasury.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await treasury.EXECUTOR_ROLE();
  
  const grantProposerTx = await treasury.grantRole(PROPOSER_ROLE, governorAddress);
  await grantProposerTx.wait();
  console.log("   ✅ Governor granted PROPOSER_ROLE");
  
  const grantExecutorTx = await treasury.grantRole(EXECUTOR_ROLE, governorAddress);
  await grantExecutorTx.wait();
  console.log("   ✅ Governor granted EXECUTOR_ROLE");

  // Step 5: Mint initial tokens to deployer
  console.log("\n5️⃣  Minting initial tokens...");
  const mintTx = await governanceToken.mintByTier(deployer.address, 4); // Founder tier
  await mintTx.wait();
  console.log("   ✅ Minted 100,000 DGT to deployer (Founder tier)");

  // Self-delegate to enable voting
  const delegateTx = await governanceToken.delegate(deployer.address);
  await delegateTx.wait();
  console.log("   ✅ Deployer self-delegated voting power");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DAO Governance Platform Deployed Successfully!");
  console.log("=".repeat(60));
  console.log("\n📋 Contract Addresses:");
  console.log("   GovernanceToken (DGT):", tokenAddress);
  console.log("   Treasury:", treasuryAddress);
  console.log("   DAOGovernor:", governorAddress);
  console.log("\n⚙️  Configuration:");
  console.log("   Max Supply:", hre.ethers.formatEther(MAX_SUPPLY), "DGT");
  console.log("   Daily Spending Limit:", hre.ethers.formatEther(DAILY_LIMIT), "ETH");
  console.log("   Weekly Spending Limit:", hre.ethers.formatEther(WEEKLY_LIMIT), "ETH");
  console.log("   Timelock Delay:", MIN_DELAY / 3600, "hours");
  console.log("\n👤 Initial Setup:");
  console.log("   Deployer:", deployer.address);
  console.log("   Guardian:", deployer.address);
  console.log("   Deployer Tokens:", "100,000 DGT (Founder tier)");
  console.log("=".repeat(60));

  // Return addresses for frontend config
  return {
    governanceToken: tokenAddress,
    treasury: treasuryAddress,
    governor: governorAddress
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
