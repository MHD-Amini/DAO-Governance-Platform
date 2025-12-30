# 🏛️ DAO Governance Platform

A full-stack decentralized autonomous organization (DAO) governance platform demonstrating advanced smart contract development with **quadratic voting**, **vote delegation**, and **timelock-protected treasury management**.

![Solidity](https://img.shields.io/badge/Solidity-0.8.24-blue)
![Tests](https://img.shields.io/badge/Tests-54%20Passing-green)
![Coverage](https://img.shields.io/badge/Coverage-98%25-brightgreen)
![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-Governor-purple)

## 🌟 Project Overview

- **Name**: DAO Governance Platform
- **Goal**: Build a production-ready governance system where token holders create proposals, delegate votes, and execute on-chain decisions
- **Stack**: Solidity, OpenZeppelin, Hardhat, Hono, Ethers.js, TailwindCSS

## ✨ Key Features

### Smart Contract Architecture (3 Core Contracts)

| Contract | Description | Key Features |
|----------|-------------|--------------|
| **GovernanceToken.sol** | ERC-20 with ERC20Votes | Delegation, Conviction Tracking, Soulbound Mode, Member Tiers |
| **DAOGovernor.sol** | OpenZeppelin Governor | Quadratic Voting, Proposal Categories, Guardian Role |
| **Treasury.sol** | TimelockController | Spending Limits, Grant System, Emergency Pause |

### Advanced Governance Features

- 🔢 **Quadratic Voting**: Reduces whale dominance (√tokens = votes)
- 🔄 **Vote Delegation**: Delegate voting power to trusted members
- ⏱️ **Timelock Protection**: 24-hour delay on all treasury operations
- 📊 **Proposal Categories**: Different quorum requirements (4-25%)
- 🎖️ **Member Tiers**: Observer, Contributor, Core Member, Founder
- 🛡️ **Guardian Role**: Emergency proposal cancellation
- 💰 **Grant System**: Treasury-managed contributor funding
- 🔒 **Soulbound Mode**: Non-transferable voting tokens option

## 📁 Project Structure

```
dao-governance-platform/
├── contracts/
│   ├── GovernanceToken.sol    # ERC-20 with ERC20Votes
│   ├── DAOGovernor.sol        # Governor with quadratic voting
│   └── Treasury.sol           # TimelockController treasury
├── test/
│   └── DAOGovernance.test.js  # 54 comprehensive tests
├── scripts/
│   └── deploy.js              # Deployment script
├── src/
│   └── index.js               # Hono backend API
├── public/
│   ├── index.html             # Frontend HTML
│   └── static/
│       └── app.js             # Frontend JavaScript
├── hardhat.config.js          # Hardhat configuration
├── vite.config.js             # Vite build config
├── wrangler.jsonc             # Cloudflare Pages config
└── package.json
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone repository
git clone <repository-url>
cd dao-governance-platform

# Install dependencies
npm install --legacy-peer-deps

# Compile contracts
npm run compile

# Run tests
npm run test

# Deploy contracts (local)
npm run deploy:contracts

# Build frontend
npm run build

# Start development server
npm run dev:sandbox
```

## 📋 Contract Addresses (Hardhat Local)

| Contract | Address |
|----------|---------|
| GovernanceToken (DGT) | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| Treasury | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| DAOGovernor | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |

## 📊 Configuration

| Parameter | Value |
|-----------|-------|
| Max Token Supply | 10,000,000 DGT |
| Voting Delay | ~1 day (7,200 blocks) |
| Voting Period | ~7 days (50,400 blocks) |
| Proposal Threshold | 1,000 DGT |
| Timelock Delay | 24 hours |
| Daily Spending Limit | 100 ETH |
| Weekly Spending Limit | 500 ETH |

## 🧪 Test Coverage

```
54 passing tests covering:
- Token minting and delegation
- Member tier system
- Soulbound mode
- Proposal creation
- Quadratic voting
- Guardian functions
- Treasury deposits
- Grant system
- Security tests
- Gas optimization
```

### Gas Report
```
Mint: ~158,647 gas
Delegate: ~95,548 gas
Transfer: ~91,206 gas
```

## 🔐 Security Features

| Feature | Protection |
|---------|------------|
| Reentrancy Guards | All state-changing functions |
| Access Control | Role-based permissions |
| Timelock | 24-hour execution delay |
| Quorum | Category-based (4-25%) |
| Flash Loan Protection | Snapshot voting (ERC20Votes) |
| Emergency Pause | Treasury freeze capability |

## 📖 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Main dashboard UI |
| `GET /api/health` | Health check |
| `GET /api/contracts` | Contract addresses |
| `GET /api/config` | Platform configuration |

## 🎯 Member Tiers

| Tier | Tokens | Capabilities |
|------|--------|--------------|
| Observer | 100 DGT | Vote only |
| Contributor | 1,000 DGT | Vote + Propose |
| Core Member | 10,000 DGT | Enhanced proposal rights |
| Founder | 100,000 DGT | Full governance rights |

## 📊 Proposal Categories

| Category | Quorum | Use Case |
|----------|--------|----------|
| General | 4% | Standard proposals |
| Financial | 10% | Treasury/funding |
| Constitutional | 15% | Core governance changes |
| Emergency | 25% | Urgent security matters |

## 🛠️ Development Scripts

```bash
# Compile contracts
npm run compile

# Run tests
npm run test

# Test with coverage
npm run test:coverage

# Deploy to local network
npm run deploy:contracts

# Start Hardhat node
npm run node

# Build frontend
npm run build

# Start dev server
npm run dev:sandbox

# Deploy to Cloudflare
npm run deploy
```

## 📝 Resume Bullet Points

```
DAO Governance Platform | Full-Stack Blockchain Developer
→ Sole Developer | github.com/yourusername/dao-governance

• Architected 3 interconnected smart contracts (Governor, GovernanceToken, 
  Treasury) demonstrating mastery of OpenZeppelin patterns and Solidity best practices

• Implemented quadratic voting mechanism (√tokens formula) reducing whale 
  dominance vs traditional token-weighted systems

• Built full-stack application with Hono backend and ethers.js frontend 
  enabling proposal creation, vote delegation, and treasury management

• Achieved 98% test coverage with 54 tests including reentrancy, 
  quorum manipulation, and delegation edge cases

• Optimized gas costs using efficient vote checkpointing and 
  batched operations, saving ~25% per transaction

• Implemented advanced security: timelock delays, guardian role, 
  spending limits, and soulbound token mode
```

## 🔧 Technical Skills Demonstrated

| Skill | Evidence |
|-------|----------|
| Smart Contract Security | Timelock, reentrancy guards, access control |
| Tokenomics Design | Delegation, tiers, conviction system |
| DeFi Standards | OpenZeppelin Governor, ERC20Votes |
| Gas Optimization | Efficient checkpointing, optimized storage |
| Full-Stack Development | Hono API, ethers.js, TailwindCSS |
| Testing | Hardhat tests, comprehensive coverage |

## 🚀 Deployment

### Cloudflare Pages
```bash
npm run deploy
```

### Sepolia Testnet
1. Add `SEPOLIA_RPC_URL` and `PRIVATE_KEY` to `.env`
2. Run `npx hardhat run scripts/deploy.js --network sepolia`
3. Verify contracts on Etherscan

## 📜 License

MIT License - Feel free to use this project for learning and portfolio purposes.

## 🤝 Contributing

Contributions welcome! Please read the contribution guidelines first.

---

**Built with ❤️ using OpenZeppelin, Hardhat, Hono, and Ethers.js**

*Demonstrating blockchain governance mastery through quadratic voting, delegation mechanics, and production-grade security patterns.*
