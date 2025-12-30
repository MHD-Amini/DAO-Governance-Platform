import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';

const app = new Hono();

// Enable CORS
app.use('/api/*', cors());

// Contract addresses
const CONTRACT_ADDRESSES = {
    governanceToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    treasury: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    governor: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
};

// API endpoints
app.get('/api/contracts', (c) => {
    return c.json(CONTRACT_ADDRESSES);
});

app.get('/api/health', (c) => {
    return c.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        platform: 'DAO Governance Platform'
    });
});

app.get('/api/config', (c) => {
    return c.json({
        chainId: 31337,
        networkName: 'Hardhat Local',
        contracts: CONTRACT_ADDRESSES,
        tokenSymbol: 'DGT',
        tokenName: 'DAO Governance Token',
        maxSupply: '10000000',
        timelockDelay: 86400,
        votingDelay: 7200,
        votingPeriod: 50400,
        proposalThreshold: '1000'
    });
});

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }));

// Serve index.html for root path
app.get('/', (c) => {
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DAO Governance Platform</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/ethers@6.9.0/dist/ethers.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        maroon: {
                            50: '#fdf2f4',
                            100: '#fce7ea',
                            200: '#f9d0d9',
                            300: '#f4a9b8',
                            400: '#ec7991',
                            500: '#df4d6d',
                            600: '#cc2d52',
                            700: '#ab2143',
                            800: '#8f1e3c',
                            900: '#800020',
                            950: '#4a0012',
                        }
                    }
                }
            }
        }
    </script>
    <style>
        @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 20px rgba(128, 0, 32, 0.3); }
            50% { box-shadow: 0 0 40px rgba(128, 0, 32, 0.6); }
        }
        .pulse-glow { animation: pulse-glow 2s infinite; }
        .gradient-bg { background: linear-gradient(135deg, #800020 0%, #4a0012 100%); }
        .glass-effect {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .card-hover:hover { transform: translateY(-5px); transition: all 0.3s ease; }
        .stat-card { background: linear-gradient(145deg, rgba(128, 0, 32, 0.1) 0%, rgba(74, 0, 18, 0.2) 100%); }
    </style>
</head>
<body class="bg-gray-950 text-white min-h-screen">
    <!-- Navigation -->
    <nav class="gradient-bg shadow-lg sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex items-center justify-between h-16">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                        <i class="fas fa-landmark text-xl text-maroon-200"></i>
                    </div>
                    <span class="text-xl font-bold">DAO Governance</span>
                </div>
                <div class="hidden md:flex items-center space-x-6">
                    <button onclick="showSection('dashboard')" class="nav-link hover:text-maroon-200 transition" data-section="dashboard">
                        <i class="fas fa-chart-line mr-2"></i>Dashboard
                    </button>
                    <button onclick="showSection('proposals')" class="nav-link hover:text-maroon-200 transition" data-section="proposals">
                        <i class="fas fa-file-alt mr-2"></i>Proposals
                    </button>
                    <button onclick="showSection('delegates')" class="nav-link hover:text-maroon-200 transition" data-section="delegates">
                        <i class="fas fa-users mr-2"></i>Delegates
                    </button>
                    <button onclick="showSection('treasury')" class="nav-link hover:text-maroon-200 transition" data-section="treasury">
                        <i class="fas fa-vault mr-2"></i>Treasury
                    </button>
                    <button onclick="showSection('contracts')" class="nav-link hover:text-maroon-200 transition" data-section="contracts">
                        <i class="fas fa-code mr-2"></i>Contracts
                    </button>
                </div>
                <div>
                    <button id="connectBtn" onclick="connectWallet()" class="bg-white text-maroon-900 px-6 py-2 rounded-lg font-semibold hover:bg-maroon-100 transition pulse-glow">
                        <i class="fas fa-wallet mr-2"></i>Connect Wallet
                    </button>
                </div>
            </div>
        </div>
    </nav>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Dashboard Section -->
        <section id="dashboard" class="section">
            <!-- Hero Stats -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="stat-card rounded-xl p-6 border border-maroon-800/30 card-hover">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-400 text-sm">Your Voting Power</p>
                            <p id="votingPower" class="text-3xl font-bold text-maroon-300">0 DGT</p>
                        </div>
                        <div class="w-14 h-14 bg-maroon-900/50 rounded-xl flex items-center justify-center">
                            <i class="fas fa-bolt text-2xl text-maroon-400"></i>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center text-sm">
                        <span id="memberTier" class="bg-maroon-900/50 px-2 py-1 rounded text-maroon-300">Not Connected</span>
                    </div>
                </div>

                <div class="stat-card rounded-xl p-6 border border-maroon-800/30 card-hover">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-400 text-sm">Active Proposals</p>
                            <p id="activeProposals" class="text-3xl font-bold text-maroon-300">0</p>
                        </div>
                        <div class="w-14 h-14 bg-maroon-900/50 rounded-xl flex items-center justify-center">
                            <i class="fas fa-file-contract text-2xl text-maroon-400"></i>
                        </div>
                    </div>
                </div>

                <div class="stat-card rounded-xl p-6 border border-maroon-800/30 card-hover">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-400 text-sm">Treasury Balance</p>
                            <p id="treasuryBalance" class="text-3xl font-bold text-maroon-300">0 ETH</p>
                        </div>
                        <div class="w-14 h-14 bg-maroon-900/50 rounded-xl flex items-center justify-center">
                            <i class="fas fa-coins text-2xl text-maroon-400"></i>
                        </div>
                    </div>
                </div>

                <div class="stat-card rounded-xl p-6 border border-maroon-800/30 card-hover">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-400 text-sm">Total Token Supply</p>
                            <p id="totalSupply" class="text-3xl font-bold text-maroon-300">0 DGT</p>
                        </div>
                        <div class="w-14 h-14 bg-maroon-900/50 rounded-xl flex items-center justify-center">
                            <i class="fas fa-chart-pie text-2xl text-maroon-400"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div class="bg-gray-900 rounded-xl p-6 border border-maroon-800/30">
                    <h3 class="text-lg font-semibold mb-4"><i class="fas fa-chart-bar text-maroon-400 mr-2"></i>Voting Activity</h3>
                    <canvas id="votingChart" height="200"></canvas>
                </div>
                <div class="bg-gray-900 rounded-xl p-6 border border-maroon-800/30">
                    <h3 class="text-lg font-semibold mb-4"><i class="fas fa-chart-doughnut text-maroon-400 mr-2"></i>Token Distribution</h3>
                    <canvas id="distributionChart" height="200"></canvas>
                </div>
            </div>

            <!-- Smart Contract Features -->
            <div class="bg-gray-900 rounded-xl p-6 border border-maroon-800/30">
                <h3 class="text-lg font-semibold mb-4"><i class="fas fa-shield-alt text-maroon-400 mr-2"></i>Smart Contract Features</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-gray-800/50 rounded-lg p-4">
                        <h4 class="font-semibold text-maroon-300 mb-2"><i class="fas fa-square-root-alt mr-2"></i>Quadratic Voting</h4>
                        <p class="text-sm text-gray-400">Reduces whale dominance using √tokens formula</p>
                    </div>
                    <div class="bg-gray-800/50 rounded-lg p-4">
                        <h4 class="font-semibold text-maroon-300 mb-2"><i class="fas fa-lock mr-2"></i>Timelock Protection</h4>
                        <p class="text-sm text-gray-400">24-hour delay on all treasury operations</p>
                    </div>
                    <div class="bg-gray-800/50 rounded-lg p-4">
                        <h4 class="font-semibold text-maroon-300 mb-2"><i class="fas fa-users-cog mr-2"></i>Delegation System</h4>
                        <p class="text-sm text-gray-400">Delegate voting power to trusted members</p>
                    </div>
                    <div class="bg-gray-800/50 rounded-lg p-4">
                        <h4 class="font-semibold text-maroon-300 mb-2"><i class="fas fa-layer-group mr-2"></i>Member Tiers</h4>
                        <p class="text-sm text-gray-400">Observer, Contributor, Core, Founder levels</p>
                    </div>
                    <div class="bg-gray-800/50 rounded-lg p-4">
                        <h4 class="font-semibold text-maroon-300 mb-2"><i class="fas fa-hand-holding-usd mr-2"></i>Grant System</h4>
                        <p class="text-sm text-gray-400">Treasury-managed contributor grants</p>
                    </div>
                    <div class="bg-gray-800/50 rounded-lg p-4">
                        <h4 class="font-semibold text-maroon-300 mb-2"><i class="fas fa-user-shield mr-2"></i>Guardian Role</h4>
                        <p class="text-sm text-gray-400">Emergency proposal cancellation power</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- Proposals Section -->
        <section id="proposals" class="section hidden">
            <div class="flex justify-between items-center mb-8">
                <h2 class="text-2xl font-bold"><i class="fas fa-file-alt text-maroon-400 mr-3"></i>Governance Proposals</h2>
                <button onclick="showCreateProposal()" class="bg-maroon-700 hover:bg-maroon-600 px-6 py-3 rounded-lg font-semibold transition">
                    <i class="fas fa-plus mr-2"></i>Create Proposal
                </button>
            </div>
            <div class="bg-gray-900 rounded-xl p-6 border border-maroon-800/30">
                <p class="text-gray-400 text-center py-8">Connect wallet to view and create proposals</p>
            </div>
        </section>

        <!-- Delegates Section -->
        <section id="delegates" class="section hidden">
            <h2 class="text-2xl font-bold mb-8"><i class="fas fa-users text-maroon-400 mr-3"></i>Delegation Center</h2>
            <div class="bg-gray-900 rounded-xl p-6 border border-maroon-800/30 mb-8">
                <h3 class="text-lg font-semibold mb-4">Delegate Your Voting Power</h3>
                <div class="flex space-x-4">
                    <input type="text" id="delegateAddress" placeholder="0x... delegate address" class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:border-maroon-500 focus:outline-none">
                    <button onclick="delegateVotes()" class="bg-maroon-700 hover:bg-maroon-600 px-6 py-3 rounded-lg font-semibold transition">Delegate</button>
                </div>
                <button onclick="selfDelegate()" class="text-maroon-400 hover:text-maroon-300 text-sm mt-4"><i class="fas fa-redo mr-1"></i>Self-delegate</button>
            </div>
        </section>

        <!-- Treasury Section -->
        <section id="treasury" class="section hidden">
            <h2 class="text-2xl font-bold mb-8"><i class="fas fa-vault text-maroon-400 mr-3"></i>DAO Treasury</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="bg-gray-900 rounded-xl p-6 border border-maroon-800/30">
                    <p class="text-gray-400 text-sm">Total Balance</p>
                    <p class="text-3xl font-bold text-maroon-300">0 ETH</p>
                </div>
                <div class="bg-gray-900 rounded-xl p-6 border border-maroon-800/30">
                    <p class="text-gray-400 text-sm">Daily Limit</p>
                    <p class="text-3xl font-bold text-maroon-300">100 ETH</p>
                </div>
                <div class="bg-gray-900 rounded-xl p-6 border border-maroon-800/30">
                    <p class="text-gray-400 text-sm">Weekly Limit</p>
                    <p class="text-3xl font-bold text-maroon-300">500 ETH</p>
                </div>
            </div>
        </section>

        <!-- Contracts Section -->
        <section id="contracts" class="section hidden">
            <h2 class="text-2xl font-bold mb-8"><i class="fas fa-code text-maroon-400 mr-3"></i>Smart Contracts</h2>
            <div class="space-y-6">
                <div class="bg-gray-900 rounded-xl p-6 border border-maroon-800/30">
                    <h3 class="text-lg font-semibold text-maroon-300 mb-2">GovernanceToken.sol</h3>
                    <p class="text-gray-400 mb-2">ERC-20 token with ERC20Votes delegation, conviction tracking, and soulbound mode</p>
                    <code class="block bg-gray-800 rounded p-3 text-sm font-mono">${CONTRACT_ADDRESSES.governanceToken}</code>
                </div>
                <div class="bg-gray-900 rounded-xl p-6 border border-maroon-800/30">
                    <h3 class="text-lg font-semibold text-maroon-300 mb-2">DAOGovernor.sol</h3>
                    <p class="text-gray-400 mb-2">OpenZeppelin Governor with quadratic voting and proposal categories</p>
                    <code class="block bg-gray-800 rounded p-3 text-sm font-mono">${CONTRACT_ADDRESSES.governor}</code>
                </div>
                <div class="bg-gray-900 rounded-xl p-6 border border-maroon-800/30">
                    <h3 class="text-lg font-semibold text-maroon-300 mb-2">Treasury.sol</h3>
                    <p class="text-gray-400 mb-2">TimelockController with spending limits and grant system</p>
                    <code class="block bg-gray-800 rounded p-3 text-sm font-mono">${CONTRACT_ADDRESSES.treasury}</code>
                </div>
            </div>
        </section>
    </main>

    <!-- Create Proposal Modal -->
    <div id="createProposalModal" class="fixed inset-0 bg-black/80 hidden items-center justify-center z-50">
        <div class="bg-gray-900 rounded-xl p-8 max-w-2xl w-full mx-4 border border-maroon-800/30">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold">Create New Proposal</h2>
                <button onclick="hideCreateProposal()" class="text-gray-400 hover:text-white"><i class="fas fa-times text-xl"></i></button>
            </div>
            <form onsubmit="submitProposal(event)" class="space-y-6">
                <div>
                    <label class="block text-sm text-gray-400 mb-2">Title</label>
                    <input type="text" id="proposalTitle" required class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
                </div>
                <div>
                    <label class="block text-sm text-gray-400 mb-2">Description</label>
                    <textarea id="proposalDescription" required rows="4" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3"></textarea>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm text-gray-400 mb-2">Category</label>
                        <select id="proposalCategory" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
                            <option value="0">General (4% quorum)</option>
                            <option value="1">Financial (10% quorum)</option>
                            <option value="2">Constitutional (15% quorum)</option>
                            <option value="3">Emergency (25% quorum)</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm text-gray-400 mb-2">Voting Mode</label>
                        <select id="votingMode" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
                            <option value="0">Standard</option>
                            <option value="1">Quadratic</option>
                            <option value="2">Conviction</option>
                        </select>
                    </div>
                </div>
                <div class="flex space-x-4">
                    <button type="button" onclick="hideCreateProposal()" class="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-lg font-semibold">Cancel</button>
                    <button type="submit" class="flex-1 bg-maroon-700 hover:bg-maroon-600 py-3 rounded-lg font-semibold"><i class="fas fa-paper-plane mr-2"></i>Submit</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Footer -->
    <footer class="border-t border-gray-800 mt-16">
        <div class="max-w-7xl mx-auto px-4 py-8 text-center text-gray-500">
            <p>Built with OpenZeppelin Governor • Hardhat • Hono • Ethers.js</p>
            <p class="mt-1">Smart Contract Security: Timelock • Quadratic Voting • Reentrancy Guards • 54 Tests Passing</p>
        </div>
    </footer>

    <script src="/static/app.js"></script>
</body>
</html>`);
});

export default app;
