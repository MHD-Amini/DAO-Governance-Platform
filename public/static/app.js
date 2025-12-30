// =============================================
// DAO Governance Platform - Frontend Application
// =============================================

// Contract ABIs (simplified for frontend)
const GovernanceTokenABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function getVotes(address) view returns (uint256)",
    "function delegates(address) view returns (address)",
    "function delegate(address)",
    "function getMemberTier(address) view returns (uint8)",
    "function getTierName(uint8) view returns (string)",
    "function canPropose(address) view returns (bool)",
    "function getEffectiveVotingPower(address) view returns (uint256)",
    "function isSoulbound() view returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate)"
];

const DAOGovernorABI = [
    "function proposalCount() view returns (uint256)",
    "function proposalThreshold() view returns (uint256)",
    "function votingDelay() view returns (uint256)",
    "function votingPeriod() view returns (uint256)",
    "function quorum(uint256 blockNumber) view returns (uint256)",
    "function state(uint256 proposalId) view returns (uint8)",
    "function guardian() view returns (address)",
    "function getProposalData(uint256 proposalId) view returns (tuple(uint8 category, uint8 votingMode, uint256 quadraticForVotes, uint256 quadraticAgainstVotes, uint256 quadraticAbstainVotes, address proposer, uint256 createdAt, bool cancelled, string title, string description))",
    "function getQuadraticVotes(uint256 proposalId) view returns (uint256, uint256, uint256)",
    "function categoryQuorums(uint8) view returns (uint256)",
    "function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)",
    "function proposeWithCategory(address[] targets, uint256[] values, bytes[] calldatas, string description, uint8 category, uint8 votingMode, string title) returns (uint256)",
    "function castVote(uint256 proposalId, uint8 support) returns (uint256)",
    "function castQuadraticVote(uint256 proposalId, uint8 support, string reason) returns (uint256)",
    "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
    "event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)"
];

const TreasuryABI = [
    "function getBalance() view returns (uint256)",
    "function dailySpendingLimit() view returns (uint256)",
    "function weeklySpendingLimit() view returns (uint256)",
    "function getRemainingDailyAllowance() view returns (uint256)",
    "function getStats() view returns (tuple(uint256 totalDeposited, uint256 totalWithdrawn, uint256 totalGrantsCreated, uint256 totalGrantsClaimed, uint256 totalGrantsCancelled))",
    "function grantCounter() view returns (uint256)",
    "function deposit(string memo) payable",
    "event FundsDeposited(address indexed depositor, uint256 amount, string memo)"
];

// Contract Addresses (Update after deployment)
const CONTRACT_ADDRESSES = {
    governanceToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    treasury: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    governor: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
};

// Global State
let provider = null;
let signer = null;
let contracts = {};
let currentAccount = null;
let votingChart = null;
let distributionChart = null;

// =============================================
// Wallet Connection
// =============================================

async function connectWallet() {
    try {
        if (typeof window.ethereum === 'undefined') {
            alert('Please install MetaMask or another Web3 wallet to use this application.');
            return;
        }

        provider = new ethers.BrowserProvider(window.ethereum);
        
        // Request account access
        const accounts = await provider.send("eth_requestAccounts", []);
        currentAccount = accounts[0];
        signer = await provider.getSigner();

        // Initialize contracts
        contracts.token = new ethers.Contract(
            CONTRACT_ADDRESSES.governanceToken,
            GovernanceTokenABI,
            signer
        );
        contracts.governor = new ethers.Contract(
            CONTRACT_ADDRESSES.governor,
            DAOGovernorABI,
            signer
        );
        contracts.treasury = new ethers.Contract(
            CONTRACT_ADDRESSES.treasury,
            TreasuryABI,
            signer
        );

        // Update UI
        updateWalletButton();
        await loadDashboardData();
        
        // Listen for account changes
        window.ethereum.on('accountsChanged', handleAccountChange);
        window.ethereum.on('chainChanged', () => window.location.reload());

        console.log('Wallet connected:', currentAccount);
    } catch (error) {
        console.error('Error connecting wallet:', error);
        alert('Error connecting wallet. Please try again.');
    }
}

function handleAccountChange(accounts) {
    if (accounts.length === 0) {
        disconnectWallet();
    } else {
        currentAccount = accounts[0];
        updateWalletButton();
        loadDashboardData();
    }
}

function disconnectWallet() {
    currentAccount = null;
    signer = null;
    contracts = {};
    document.getElementById('connectBtn').innerHTML = '<i class="fas fa-wallet mr-2"></i>Connect Wallet';
    resetDashboard();
}

function updateWalletButton() {
    const btn = document.getElementById('connectBtn');
    const shortAddress = `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`;
    btn.innerHTML = `<i class="fas fa-check-circle mr-2"></i>${shortAddress}`;
    btn.classList.remove('pulse-glow');
}

// =============================================
// Dashboard Data Loading
// =============================================

async function loadDashboardData() {
    if (!currentAccount || !contracts.token) {
        console.log('Wallet not connected');
        return;
    }

    try {
        // Load voting power
        const votingPower = await contracts.token.getVotes(currentAccount);
        document.getElementById('votingPower').textContent = 
            `${formatTokenAmount(votingPower)} DGT`;

        // Load member tier
        const tierNum = await contracts.token.getMemberTier(currentAccount);
        const tierName = await contracts.token.getTierName(tierNum);
        document.getElementById('memberTier').textContent = tierName || 'None';

        // Load total supply
        const totalSupply = await contracts.token.totalSupply();
        document.getElementById('totalSupply').textContent = 
            `${formatTokenAmount(totalSupply)} DGT`;

        // Load proposal count
        const proposalCount = await contracts.governor.proposalCount();
        document.getElementById('activeProposals').textContent = proposalCount.toString();

        // Load treasury balance
        const treasuryBalance = await contracts.treasury.getBalance();
        document.getElementById('treasuryBalance').textContent = 
            `${ethers.formatEther(treasuryBalance)} ETH`;
        document.getElementById('treasuryTotal').textContent = 
            `${ethers.formatEther(treasuryBalance)} ETH`;

        // Load delegate
        const delegate = await contracts.token.delegates(currentAccount);
        if (delegate && delegate !== ethers.ZeroAddress) {
            const shortDelegate = `${delegate.slice(0, 10)}...${delegate.slice(-8)}`;
            document.getElementById('currentDelegate').textContent = shortDelegate;
        }

        // Initialize charts
        initializeCharts();

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function resetDashboard() {
    document.getElementById('votingPower').textContent = '0 DGT';
    document.getElementById('memberTier').textContent = 'Not Connected';
    document.getElementById('totalSupply').textContent = '0 DGT';
    document.getElementById('activeProposals').textContent = '0';
    document.getElementById('treasuryBalance').textContent = '0 ETH';
    document.getElementById('currentDelegate').textContent = 'Not delegated';
}

// =============================================
// Charts
// =============================================

function initializeCharts() {
    // Voting Activity Chart
    const votingCtx = document.getElementById('votingChart');
    if (votingChart) votingChart.destroy();
    
    votingChart = new Chart(votingCtx, {
        type: 'bar',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [{
                label: 'Votes Cast',
                data: [12, 19, 8, 15],
                backgroundColor: 'rgba(128, 0, 32, 0.6)',
                borderColor: 'rgba(128, 0, 32, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: { color: '#9CA3AF' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#9CA3AF' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                },
                x: {
                    ticks: { color: '#9CA3AF' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            }
        }
    });

    // Token Distribution Chart
    const distCtx = document.getElementById('distributionChart');
    if (distributionChart) distributionChart.destroy();
    
    distributionChart = new Chart(distCtx, {
        type: 'doughnut',
        data: {
            labels: ['Founders', 'Core Members', 'Contributors', 'Observers', 'Treasury'],
            datasets: [{
                data: [40, 25, 20, 10, 5],
                backgroundColor: [
                    'rgba(128, 0, 32, 0.8)',
                    'rgba(171, 33, 67, 0.8)',
                    'rgba(204, 45, 82, 0.8)',
                    'rgba(236, 121, 145, 0.8)',
                    'rgba(74, 0, 18, 0.8)'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#9CA3AF' }
                }
            }
        }
    });
}

// =============================================
// Navigation
// =============================================

function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.remove('hidden');
    
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('text-maroon-200');
    });
    document.querySelector(`[data-section="${sectionId}"]`)?.classList.add('text-maroon-200');
}

// =============================================
// Proposal Functions
// =============================================

function showCreateProposal() {
    document.getElementById('createProposalModal').classList.remove('hidden');
    document.getElementById('createProposalModal').classList.add('flex');
}

function hideCreateProposal() {
    document.getElementById('createProposalModal').classList.add('hidden');
    document.getElementById('createProposalModal').classList.remove('flex');
}

async function submitProposal(event) {
    event.preventDefault();
    
    if (!currentAccount || !contracts.governor) {
        alert('Please connect your wallet first.');
        return;
    }

    const title = document.getElementById('proposalTitle').value;
    const description = document.getElementById('proposalDescription').value;
    const category = parseInt(document.getElementById('proposalCategory').value);
    const votingMode = parseInt(document.getElementById('votingMode').value);
    const targetAddress = document.getElementById('targetAddress').value || CONTRACT_ADDRESSES.treasury;

    try {
        // Check if user can propose
        const canPropose = await contracts.token.canPropose(currentAccount);
        if (!canPropose) {
            alert('You need at least 1,000 DGT voting power and Contributor tier to create proposals.');
            return;
        }

        const tx = await contracts.governor.proposeWithCategory(
            [targetAddress],
            [0],
            ["0x"],
            description,
            category,
            votingMode,
            title
        );

        alert('Proposal submitted! Waiting for confirmation...');
        await tx.wait();
        alert('Proposal created successfully!');
        
        hideCreateProposal();
        loadDashboardData();
        
    } catch (error) {
        console.error('Error creating proposal:', error);
        alert('Error creating proposal: ' + (error.reason || error.message));
    }
}

function filterProposals(filter) {
    // Update filter buttons
    document.querySelectorAll('.proposal-filter').forEach(btn => {
        btn.classList.remove('active', 'bg-maroon-900/50', 'border-maroon-700');
        btn.classList.add('bg-gray-800/50', 'border-gray-700');
    });
    
    event.target.classList.remove('bg-gray-800/50', 'border-gray-700');
    event.target.classList.add('active', 'bg-maroon-900/50', 'border-maroon-700');
    
    // Filter logic would go here
    console.log('Filtering proposals by:', filter);
}

async function castVote(proposalId, support) {
    if (!currentAccount || !contracts.governor) {
        alert('Please connect your wallet first.');
        return;
    }

    try {
        const tx = await contracts.governor.castVote(proposalId, support);
        alert('Vote submitted! Waiting for confirmation...');
        await tx.wait();
        alert('Vote cast successfully!');
        loadDashboardData();
    } catch (error) {
        console.error('Error casting vote:', error);
        alert('Error casting vote: ' + (error.reason || error.message));
    }
}

// =============================================
// Delegation Functions
// =============================================

async function delegateVotes() {
    if (!currentAccount || !contracts.token) {
        alert('Please connect your wallet first.');
        return;
    }

    const delegateAddress = document.getElementById('delegateAddress').value;
    if (!ethers.isAddress(delegateAddress)) {
        alert('Please enter a valid Ethereum address.');
        return;
    }

    try {
        const tx = await contracts.token.delegate(delegateAddress);
        alert('Delegation submitted! Waiting for confirmation...');
        await tx.wait();
        alert('Successfully delegated voting power!');
        loadDashboardData();
    } catch (error) {
        console.error('Error delegating:', error);
        alert('Error delegating: ' + (error.reason || error.message));
    }
}

async function selfDelegate() {
    if (!currentAccount || !contracts.token) {
        alert('Please connect your wallet first.');
        return;
    }

    try {
        const tx = await contracts.token.delegate(currentAccount);
        alert('Self-delegation submitted! Waiting for confirmation...');
        await tx.wait();
        alert('Successfully self-delegated voting power!');
        loadDashboardData();
    } catch (error) {
        console.error('Error self-delegating:', error);
        alert('Error self-delegating: ' + (error.reason || error.message));
    }
}

// =============================================
// Treasury Functions
// =============================================

async function depositToTreasury() {
    if (!currentAccount || !contracts.treasury) {
        alert('Please connect your wallet first.');
        return;
    }

    const amount = prompt('Enter amount in ETH to deposit:');
    if (!amount || isNaN(parseFloat(amount))) {
        return;
    }

    try {
        const tx = await contracts.treasury.deposit('Web deposit', {
            value: ethers.parseEther(amount)
        });
        alert('Deposit submitted! Waiting for confirmation...');
        await tx.wait();
        alert('Successfully deposited to treasury!');
        loadDashboardData();
    } catch (error) {
        console.error('Error depositing:', error);
        alert('Error depositing: ' + (error.reason || error.message));
    }
}

// =============================================
// Utility Functions
// =============================================

function formatTokenAmount(amount) {
    const formatted = ethers.formatEther(amount);
    return parseFloat(formatted).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getProposalStateName(state) {
    const states = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];
    return states[state] || 'Unknown';
}

function getCategoryName(category) {
    const categories = ['General', 'Financial', 'Constitutional', 'Emergency'];
    return categories[category] || 'Unknown';
}

function getVotingModeName(mode) {
    const modes = ['Standard', 'Quadratic', 'Conviction'];
    return modes[mode] || 'Unknown';
}

// =============================================
// Initialization
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('DAO Governance Platform initialized');
    
    // Check if wallet was previously connected
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet();
    }
    
    // Initialize charts with placeholder data
    setTimeout(() => {
        if (document.getElementById('votingChart')) {
            initializeCharts();
        }
    }, 100);
});

// Expose functions to global scope for HTML onclick handlers
window.connectWallet = connectWallet;
window.showSection = showSection;
window.showCreateProposal = showCreateProposal;
window.hideCreateProposal = hideCreateProposal;
window.submitProposal = submitProposal;
window.filterProposals = filterProposals;
window.delegateVotes = delegateVotes;
window.selfDelegate = selfDelegate;
window.depositToTreasury = depositToTreasury;
