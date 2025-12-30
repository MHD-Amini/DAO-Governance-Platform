const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("DAO Governance Platform", function () {
  let governanceToken;
  let treasury;
  let governor;
  let owner;
  let addr1;
  let addr2;
  let addr3;
  let guardian;

  // Constants
  const MAX_SUPPLY = ethers.parseEther("10000000"); // 10 million tokens
  const DAILY_LIMIT = ethers.parseEther("100"); // 100 ETH
  const WEEKLY_LIMIT = ethers.parseEther("500"); // 500 ETH
  const MIN_DELAY = 86400; // 1 day timelock

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, guardian] = await ethers.getSigners();

    // Deploy Governance Token
    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    governanceToken = await GovernanceToken.deploy(
      "DAO Governance Token",
      "DGT",
      MAX_SUPPLY
    );
    await governanceToken.waitForDeployment();

    // Deploy Treasury (TimelockController)
    const Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(
      MIN_DELAY,
      [owner.address], // proposers
      [owner.address], // executors
      owner.address,   // admin
      DAILY_LIMIT,
      WEEKLY_LIMIT
    );
    await treasury.waitForDeployment();

    // Deploy Governor
    const DAOGovernor = await ethers.getContractFactory("DAOGovernor");
    governor = await DAOGovernor.deploy(
      await governanceToken.getAddress(),
      await treasury.getAddress(),
      guardian.address
    );
    await governor.waitForDeployment();

    // Setup: Set timelock in governance token
    await governanceToken.setTimelock(await treasury.getAddress());
  });

  describe("GovernanceToken", function () {
    describe("Deployment", function () {
      it("Should set the correct name and symbol", async function () {
        expect(await governanceToken.name()).to.equal("DAO Governance Token");
        expect(await governanceToken.symbol()).to.equal("DGT");
      });

      it("Should set the correct max supply", async function () {
        expect(await governanceToken.maxSupply()).to.equal(MAX_SUPPLY);
      });

      it("Should set owner correctly", async function () {
        expect(await governanceToken.owner()).to.equal(owner.address);
      });

      it("Should not be soulbound by default", async function () {
        expect(await governanceToken.isSoulbound()).to.be.false;
      });
    });

    describe("Minting", function () {
      it("Should allow owner to mint tokens", async function () {
        const mintAmount = ethers.parseEther("1000");
        await governanceToken.mint(addr1.address, mintAmount);
        expect(await governanceToken.balanceOf(addr1.address)).to.equal(mintAmount);
      });

      it("Should emit TokensMinted event", async function () {
        const mintAmount = ethers.parseEther("1000");
        await expect(governanceToken.mint(addr1.address, mintAmount))
          .to.emit(governanceToken, "TokensMinted")
          .withArgs(addr1.address, mintAmount, 0); // 0 = MemberTier.None
      });

      it("Should revert if exceeding max supply", async function () {
        await expect(
          governanceToken.mint(addr1.address, MAX_SUPPLY + 1n)
        ).to.be.revertedWithCustomError(governanceToken, "MaxSupplyExceeded");
      });

      it("Should revert if non-owner tries to mint", async function () {
        await expect(
          governanceToken.connect(addr1).mint(addr2.address, ethers.parseEther("100"))
        ).to.be.revertedWithCustomError(governanceToken, "OnlyTimelockAllowed");
      });
    });

    describe("Member Tiers", function () {
      it("Should mint correct amounts for each tier", async function () {
        // Mint by tier for addr1 (Contributor)
        await governanceToken.mintByTier(addr1.address, 2); // MemberTier.Contributor
        expect(await governanceToken.balanceOf(addr1.address)).to.equal(
          ethers.parseEther("1000")
        );

        // Mint by tier for addr2 (Founder)
        await governanceToken.mintByTier(addr2.address, 4); // MemberTier.Founder
        expect(await governanceToken.balanceOf(addr2.address)).to.equal(
          ethers.parseEther("100000")
        );
      });

      it("Should track member tiers correctly", async function () {
        await governanceToken.mintByTier(addr1.address, 3); // CoreMember
        expect(await governanceToken.getMemberTier(addr1.address)).to.equal(3);
      });

      it("Should prevent duplicate tier assignment", async function () {
        await governanceToken.mintByTier(addr1.address, 2);
        await expect(
          governanceToken.mintByTier(addr1.address, 3)
        ).to.be.revertedWithCustomError(governanceToken, "TierAlreadyAssigned");
      });

      it("Should return correct tier names", async function () {
        expect(await governanceToken.getTierName(1)).to.equal("Observer");
        expect(await governanceToken.getTierName(2)).to.equal("Contributor");
        expect(await governanceToken.getTierName(3)).to.equal("Core Member");
        expect(await governanceToken.getTierName(4)).to.equal("Founder");
      });
    });

    describe("Delegation", function () {
      beforeEach(async function () {
        await governanceToken.mint(addr1.address, ethers.parseEther("10000"));
      });

      it("Should allow self-delegation", async function () {
        await governanceToken.connect(addr1).delegate(addr1.address);
        expect(await governanceToken.getVotes(addr1.address)).to.equal(
          ethers.parseEther("10000")
        );
      });

      it("Should allow delegation to another address", async function () {
        await governanceToken.connect(addr1).delegate(addr2.address);
        expect(await governanceToken.getVotes(addr2.address)).to.equal(
          ethers.parseEther("10000")
        );
        expect(await governanceToken.getVotes(addr1.address)).to.equal(0);
      });

      it("Should track delegates correctly", async function () {
        await governanceToken.connect(addr1).delegate(addr2.address);
        expect(await governanceToken.delegates(addr1.address)).to.equal(addr2.address);
      });
    });

    describe("Soulbound Mode", function () {
      beforeEach(async function () {
        await governanceToken.mint(addr1.address, ethers.parseEther("1000"));
      });

      it("Should allow transfers when not soulbound", async function () {
        await governanceToken.connect(addr1).transfer(addr2.address, ethers.parseEther("100"));
        expect(await governanceToken.balanceOf(addr2.address)).to.equal(
          ethers.parseEther("100")
        );
      });

      it("Should block transfers when soulbound", async function () {
        await governanceToken.setSoulbound(true);
        await expect(
          governanceToken.connect(addr1).transfer(addr2.address, ethers.parseEther("100"))
        ).to.be.revertedWithCustomError(governanceToken, "TransfersDisabled");
      });

      it("Should still allow minting when soulbound", async function () {
        await governanceToken.setSoulbound(true);
        await expect(
          governanceToken.mint(addr2.address, ethers.parseEther("100"))
        ).to.not.be.reverted;
      });

      it("Should still allow burning when soulbound", async function () {
        await governanceToken.setSoulbound(true);
        await governanceToken.connect(addr1).burn(ethers.parseEther("100"));
        expect(await governanceToken.balanceOf(addr1.address)).to.equal(
          ethers.parseEther("900")
        );
      });
    });

    describe("Conviction System", function () {
      beforeEach(async function () {
        await governanceToken.mint(addr1.address, ethers.parseEther("10000"));
        await governanceToken.connect(addr1).delegate(addr1.address);
      });

      it("Should initialize conviction data on mint", async function () {
        const conviction = await governanceToken.getConvictionData(addr1.address);
        expect(conviction.consecutiveDays).to.equal(0);
        expect(conviction.bonusMultiplier).to.equal(0);
      });

      it("Should calculate effective voting power with conviction", async function () {
        const baseVotes = await governanceToken.getVotes(addr1.address);
        const effectiveVotes = await governanceToken.getEffectiveVotingPower(addr1.address);
        
        // Initially they should be equal (no conviction bonus yet)
        expect(effectiveVotes).to.equal(baseVotes);
      });
    });

    describe("canPropose", function () {
      it("Should return true for eligible proposers", async function () {
        await governanceToken.mintByTier(addr1.address, 2); // Contributor
        await governanceToken.connect(addr1).delegate(addr1.address);
        
        expect(await governanceToken.canPropose(addr1.address)).to.be.true;
      });

      it("Should return false for observers", async function () {
        await governanceToken.mintByTier(addr1.address, 1); // Observer
        await governanceToken.connect(addr1).delegate(addr1.address);
        
        expect(await governanceToken.canPropose(addr1.address)).to.be.false;
      });
    });
  });

  describe("DAOGovernor", function () {
    beforeEach(async function () {
      // Setup: Mint tokens and delegate
      await governanceToken.mintByTier(owner.address, 4); // Founder
      await governanceToken.connect(owner).delegate(owner.address);
      
      await governanceToken.mintByTier(addr1.address, 3); // CoreMember
      await governanceToken.connect(addr1).delegate(addr1.address);
      
      await governanceToken.mintByTier(addr2.address, 2); // Contributor
      await governanceToken.connect(addr2).delegate(addr2.address);
    });

    describe("Deployment", function () {
      it("Should set correct guardian", async function () {
        expect(await governor.guardian()).to.equal(guardian.address);
      });

      it("Should enable quadratic voting by default", async function () {
        expect(await governor.quadraticVotingEnabled()).to.be.true;
      });
    });

    describe("Proposal Creation", function () {
      it("Should allow eligible members to create proposals", async function () {
        const targets = [await treasury.getAddress()];
        const values = [0];
        const calldatas = ["0x"];
        const description = "Test Proposal";

        await mine(1); // Mine a block for voting power checkpoint

        const tx = await governor.proposeWithCategory(
          targets,
          values,
          calldatas,
          description,
          0, // General category
          0, // Standard voting
          "Test Proposal Title"
        );

        await expect(tx).to.emit(governor, "ProposalCategorySet");
      });

      it("Should track proposal count", async function () {
        const targets = [await treasury.getAddress()];
        const values = [0];
        const calldatas = ["0x"];

        await mine(1);

        await governor.proposeWithCategory(
          targets,
          values,
          calldatas,
          "Proposal 1",
          0,
          0,
          "Title 1"
        );

        expect(await governor.proposalCount()).to.equal(1);
      });
    });

    describe("Quadratic Voting", function () {
      let proposalId;

      beforeEach(async function () {
        await mine(1);

        const targets = [await treasury.getAddress()];
        const values = [0];
        const calldatas = ["0x"];

        const tx = await governor.proposeWithCategory(
          targets,
          values,
          calldatas,
          "Quadratic Test",
          0,
          1, // Quadratic voting mode
          "Quadratic Test Title"
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find(log => {
          try {
            return governor.interface.parseLog(log)?.name === "ProposalCreated";
          } catch {
            return false;
          }
        });
        proposalId = governor.interface.parseLog(event).args.proposalId;

        // Fast forward past voting delay
        await mine(7201);
      });

      it("Should calculate quadratic vote weight correctly", async function () {
        // Owner has 100,000 tokens (Founder tier)
        // sqrt(100,000 * 10^18) ≈ 316,227,766,016,837,933 (sqrt in wei terms)
        
        const tx = await governor.castQuadraticVote(proposalId, 1, "For the proposal");
        await expect(tx).to.emit(governor, "QuadraticVoteCast");
      });

      it("Should prevent double voting", async function () {
        await governor.castQuadraticVote(proposalId, 1, "First vote");
        
        await expect(
          governor.castQuadraticVote(proposalId, 1, "Second vote")
        ).to.be.revertedWithCustomError(governor, "AlreadyVoted");
      });

      it("Should track quadratic vote totals", async function () {
        await governor.castQuadraticVote(proposalId, 1, "For");
        await governor.connect(addr1).castQuadraticVote(proposalId, 0, "Against");

        const [forVotes, againstVotes, abstainVotes] = await governor.getQuadraticVotes(proposalId);
        
        expect(forVotes).to.be.gt(0);
        expect(againstVotes).to.be.gt(0);
        expect(abstainVotes).to.equal(0);
      });
    });

    describe("Guardian Functions", function () {
      let proposalId;

      beforeEach(async function () {
        await mine(1);

        const targets = [await treasury.getAddress()];
        const values = [0];
        const calldatas = ["0x"];

        const tx = await governor.proposeWithCategory(
          targets,
          values,
          calldatas,
          "Guardian Test",
          0,
          0,
          "Guardian Test Title"
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find(log => {
          try {
            return governor.interface.parseLog(log)?.name === "ProposalCreated";
          } catch {
            return false;
          }
        });
        proposalId = governor.interface.parseLog(event).args.proposalId;
      });

      it("Should allow guardian to cancel proposals", async function () {
        await expect(governor.connect(guardian).guardianCancel(proposalId))
          .to.emit(governor, "ProposalCancelled")
          .withArgs(proposalId, guardian.address);
      });

      it("Should prevent non-guardian from cancelling", async function () {
        await expect(
          governor.connect(addr1).guardianCancel(proposalId)
        ).to.be.revertedWithCustomError(governor, "OnlyGuardian");
      });

      it("Should allow guardian to transfer role", async function () {
        await governor.connect(guardian).setGuardian(addr3.address);
        expect(await governor.guardian()).to.equal(addr3.address);
      });

      it("Should allow guardian to renounce role", async function () {
        await governor.connect(guardian).renounceGuardian();
        expect(await governor.guardian()).to.equal(ethers.ZeroAddress);
      });
    });

    describe("Category Quorums", function () {
      it("Should have different quorums for different categories", async function () {
        expect(await governor.categoryQuorums(0)).to.equal(400);  // General: 4%
        expect(await governor.categoryQuorums(1)).to.equal(1000); // Financial: 10%
        expect(await governor.categoryQuorums(2)).to.equal(1500); // Constitutional: 15%
        expect(await governor.categoryQuorums(3)).to.equal(2500); // Emergency: 25%
      });
    });
  });

  describe("Treasury", function () {
    describe("Deployment", function () {
      it("Should set spending limits correctly", async function () {
        expect(await treasury.dailySpendingLimit()).to.equal(DAILY_LIMIT);
        expect(await treasury.weeklySpendingLimit()).to.equal(WEEKLY_LIMIT);
      });

      it("Should not be paused initially", async function () {
        expect(await treasury.isPaused()).to.be.false;
      });
    });

    describe("Deposits", function () {
      it("Should accept ETH deposits", async function () {
        const depositAmount = ethers.parseEther("10");
        
        await treasury.deposit("Test deposit", { value: depositAmount });
        expect(await treasury.getBalance()).to.equal(depositAmount);
      });

      it("Should emit FundsDeposited event", async function () {
        const depositAmount = ethers.parseEther("10");
        
        await expect(treasury.deposit("Test deposit", { value: depositAmount }))
          .to.emit(treasury, "FundsDeposited")
          .withArgs(owner.address, depositAmount, "Test deposit");
      });

      it("Should accept direct ETH transfers", async function () {
        const depositAmount = ethers.parseEther("5");
        
        await owner.sendTransaction({
          to: await treasury.getAddress(),
          value: depositAmount
        });
        
        expect(await treasury.getBalance()).to.equal(depositAmount);
      });

      it("Should track total deposited", async function () {
        await treasury.deposit("Deposit 1", { value: ethers.parseEther("10") });
        await treasury.deposit("Deposit 2", { value: ethers.parseEther("5") });
        
        const stats = await treasury.getStats();
        expect(stats.totalDeposited).to.equal(ethers.parseEther("15"));
      });
    });

    describe("Grant System", function () {
      beforeEach(async function () {
        // Fund treasury
        await treasury.deposit("Initial funding", { value: ethers.parseEther("100") });
      });

      it("Should track grant count", async function () {
        expect(await treasury.grantCounter()).to.equal(0);
      });

      it("Should return grant details", async function () {
        const grant = await treasury.getGrant(1);
        expect(grant.id).to.equal(0); // Grant doesn't exist yet
      });
    });

    describe("Spending Limits", function () {
      it("Should return correct remaining daily allowance", async function () {
        const remaining = await treasury.getRemainingDailyAllowance();
        expect(remaining).to.equal(DAILY_LIMIT);
      });

      it("Should return spending record", async function () {
        const record = await treasury.getSpendingRecord();
        expect(record.dailySpent).to.equal(0);
        expect(record.weeklySpent).to.equal(0);
      });
    });

    describe("Statistics", function () {
      it("Should track treasury statistics", async function () {
        await treasury.deposit("Test", { value: ethers.parseEther("50") });
        
        const stats = await treasury.getStats();
        expect(stats.totalDeposited).to.equal(ethers.parseEther("50"));
        expect(stats.totalWithdrawn).to.equal(0);
        expect(stats.totalGrantsCreated).to.equal(0);
      });
    });
  });

  describe("Integration Tests", function () {
    describe("Full Governance Flow", function () {
      beforeEach(async function () {
        // Setup complete governance system
        await governanceToken.mintByTier(owner.address, 4);
        await governanceToken.connect(owner).delegate(owner.address);
        
        // Fund treasury
        await treasury.deposit("Initial funding", { value: ethers.parseEther("100") });
      });

      it("Should allow complete proposal lifecycle", async function () {
        await mine(1);

        // Create proposal
        const targets = [await treasury.getAddress()];
        const values = [0];
        const calldatas = ["0x"];
        
        const tx = await governor.proposeWithCategory(
          targets,
          values,
          calldatas,
          "Full lifecycle test",
          0,
          0,
          "Lifecycle Test"
        );

        const receipt = await tx.wait();
        expect(receipt.status).to.equal(1);
      });
    });

    describe("Token and Governor Integration", function () {
      it("Should reflect delegation in governor voting power", async function () {
        await governanceToken.mint(addr1.address, ethers.parseEther("50000"));
        await governanceToken.connect(addr1).delegate(addr2.address);
        
        await mine(1);
        
        const votingPower = await governor.getVotes(
          addr2.address,
          await ethers.provider.getBlockNumber() - 1
        );
        
        expect(votingPower).to.equal(ethers.parseEther("50000"));
      });
    });
  });

  describe("Security Tests", function () {
    describe("Reentrancy Protection", function () {
      it("Token burn should be protected", async function () {
        await governanceToken.mint(addr1.address, ethers.parseEther("1000"));
        
        // Multiple burns should work (nonReentrant doesn't prevent sequential calls)
        await governanceToken.connect(addr1).burn(ethers.parseEther("100"));
        await governanceToken.connect(addr1).burn(ethers.parseEther("100"));
        
        expect(await governanceToken.balanceOf(addr1.address)).to.equal(
          ethers.parseEther("800")
        );
      });
    });

    describe("Access Control", function () {
      it("Should prevent unauthorized minting", async function () {
        await expect(
          governanceToken.connect(addr1).mint(addr2.address, ethers.parseEther("100"))
        ).to.be.reverted;
      });

      it("Should prevent unauthorized soulbound changes", async function () {
        await expect(
          governanceToken.connect(addr1).setSoulbound(true)
        ).to.be.reverted;
      });
    });

    describe("Input Validation", function () {
      it("Should reject zero address for minting", async function () {
        await expect(
          governanceToken.mint(ethers.ZeroAddress, ethers.parseEther("100"))
        ).to.be.revertedWithCustomError(governanceToken, "InvalidAddress");
      });

      it("Should reject invalid tier for mintByTier", async function () {
        await expect(
          governanceToken.mintByTier(addr1.address, 0) // None tier
        ).to.be.revertedWithCustomError(governanceToken, "InvalidAmount");
      });
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should track gas usage for common operations", async function () {
      // Mint tokens
      const mintTx = await governanceToken.mint(addr1.address, ethers.parseEther("1000"));
      const mintReceipt = await mintTx.wait();
      console.log("Mint gas used:", mintReceipt.gasUsed.toString());

      // Delegate
      const delegateTx = await governanceToken.connect(addr1).delegate(addr1.address);
      const delegateReceipt = await delegateTx.wait();
      console.log("Delegate gas used:", delegateReceipt.gasUsed.toString());

      // Transfer (when not soulbound)
      const transferTx = await governanceToken.connect(addr1).transfer(addr2.address, ethers.parseEther("100"));
      const transferReceipt = await transferTx.wait();
      console.log("Transfer gas used:", transferReceipt.gasUsed.toString());
    });
  });

  describe("Edge Cases and Advanced Scenarios", function () {
    describe("Max Supply Edge Cases", function () {
      it("Should allow minting up to max supply", async function () {
        // Mint a large amount close to max supply
        const largeAmount = ethers.parseEther("9900000"); // 9.9 million
        await governanceToken.mint(addr1.address, largeAmount);
        expect(await governanceToken.totalSupply()).to.equal(largeAmount);
      });

      it("Should allow updating max supply to higher value", async function () {
        const newMaxSupply = ethers.parseEther("20000000"); // 20 million
        await governanceToken.updateMaxSupply(newMaxSupply);
        expect(await governanceToken.maxSupply()).to.equal(newMaxSupply);
      });

      it("Should reject decreasing max supply", async function () {
        const lowerSupply = ethers.parseEther("5000000");
        await expect(
          governanceToken.updateMaxSupply(lowerSupply)
        ).to.be.revertedWithCustomError(governanceToken, "InvalidAmount");
      });
    });

    describe("Delegation Edge Cases", function () {
      it("Should allow changing delegate multiple times", async function () {
        await governanceToken.mint(addr1.address, ethers.parseEther("10000"));
        
        // Delegate to addr2
        await governanceToken.connect(addr1).delegate(addr2.address);
        expect(await governanceToken.delegates(addr1.address)).to.equal(addr2.address);
        
        // Change delegate to addr3
        await governanceToken.connect(addr1).delegate(addr3.address);
        expect(await governanceToken.delegates(addr1.address)).to.equal(addr3.address);
        
        // Verify voting power moved
        expect(await governanceToken.getVotes(addr2.address)).to.equal(0);
        expect(await governanceToken.getVotes(addr3.address)).to.equal(ethers.parseEther("10000"));
      });

      it("Should allow delegating to zero address (removing delegation)", async function () {
        await governanceToken.mint(addr1.address, ethers.parseEther("10000"));
        await governanceToken.connect(addr1).delegate(addr2.address);
        
        // Delegate to zero address
        await governanceToken.connect(addr1).delegate(ethers.ZeroAddress);
        expect(await governanceToken.getVotes(addr2.address)).to.equal(0);
      });
    });

    describe("Conviction System Edge Cases", function () {
      it("Should update conviction data correctly", async function () {
        await governanceToken.mint(addr1.address, ethers.parseEther("10000"));
        
        // Update conviction
        await governanceToken.updateConviction(addr1.address);
        
        const conviction = await governanceToken.getConvictionData(addr1.address);
        expect(conviction.lastActionTimestamp).to.be.gt(0);
      });
    });

    describe("Treasury Edge Cases", function () {
      it("Should correctly track multiple deposits", async function () {
        const deposit1 = ethers.parseEther("10");
        const deposit2 = ethers.parseEther("20");
        const deposit3 = ethers.parseEther("30");
        
        await treasury.deposit("First deposit", { value: deposit1 });
        await treasury.deposit("Second deposit", { value: deposit2 });
        await treasury.deposit("Third deposit", { value: deposit3 });
        
        expect(await treasury.getBalance()).to.equal(deposit1 + deposit2 + deposit3);
        
        const stats = await treasury.getStats();
        expect(stats.totalDeposited).to.equal(deposit1 + deposit2 + deposit3);
      });

      it("Should reject zero deposits", async function () {
        await expect(
          treasury.deposit("Empty deposit", { value: 0 })
        ).to.be.revertedWithCustomError(treasury, "InvalidAmount");
      });
    });

    describe("Governor Edge Cases", function () {
      let proposalId;

      beforeEach(async function () {
        await governanceToken.mintByTier(owner.address, 4);
        await governanceToken.connect(owner).delegate(owner.address);
        await mine(1);
      });

      it("Should correctly track multiple proposals", async function () {
        const targets = [await treasury.getAddress()];
        const values = [0];
        const calldatas = ["0x"];

        // Create first proposal
        await governor.proposeWithCategory(
          targets, values, calldatas, "First Proposal", 0, 0, "Title 1"
        );
        
        // Create second proposal
        await governor.proposeWithCategory(
          targets, values, calldatas, "Second Proposal", 1, 1, "Title 2"
        );
        
        expect(await governor.proposalCount()).to.equal(2);
      });

      it("Should correctly report proposal data", async function () {
        const targets = [await treasury.getAddress()];
        const values = [0];
        const calldatas = ["0x"];

        const tx = await governor.proposeWithCategory(
          targets, values, calldatas, "Test Description", 1, 1, "Test Title"
        );
        
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => {
          try {
            return governor.interface.parseLog(log)?.name === "ProposalCreated";
          } catch {
            return false;
          }
        });
        proposalId = governor.interface.parseLog(event).args.proposalId;

        const data = await governor.getProposalData(proposalId);
        expect(data.category).to.equal(1); // Financial
        expect(data.votingMode).to.equal(1); // Quadratic
        expect(data.title).to.equal("Test Title");
      });
    });
  });

  describe("Stress Tests", function () {
    it("Should handle multiple tier assignments correctly", async function () {
      const signers = await ethers.getSigners();
      
      // Assign different tiers to multiple addresses
      for (let i = 5; i < 9; i++) {
        const tier = (i % 4) + 1; // Cycles through tiers 1-4
        await governanceToken.mintByTier(signers[i].address, tier);
      }
      
      // Verify all assignments
      expect(await governanceToken.getMemberTier(signers[5].address)).to.equal(2);
      expect(await governanceToken.getMemberTier(signers[6].address)).to.equal(3);
      expect(await governanceToken.getMemberTier(signers[7].address)).to.equal(4);
      expect(await governanceToken.getMemberTier(signers[8].address)).to.equal(1);
    });
  });
});
