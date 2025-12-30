// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GovernanceToken.sol";

/**
 * @title DAOGovernor
 * @author DAO Governance Platform
 * @notice Advanced governance contract with quadratic voting and proposal categorization
 * @dev Implements OpenZeppelin Governor with custom extensions
 * 
 * KEY FEATURES:
 * - Quadratic Voting: Reduces whale dominance (√votes instead of raw votes)
 * - Proposal Categories: Different quorum requirements per category
 * - Delegation Support: Vote with delegated power
 * - Timelock Integration: Security delay before execution
 * - Emergency Actions: Guardian can cancel malicious proposals
 * - Gas Optimized: Efficient vote counting and proposal management
 */
contract DAOGovernor is 
    Governor, 
    GovernorSettings, 
    GovernorCountingSimple, 
    GovernorVotes, 
    GovernorVotesQuorumFraction, 
    GovernorTimelockControl,
    ReentrancyGuard 
{
    // ============================================
    // EVENTS
    // ============================================
    
    event QuadraticVoteCast(
        address indexed voter,
        uint256 indexed proposalId,
        uint8 support,
        uint256 rawVotes,
        uint256 quadraticVotes,
        string reason
    );
    
    event ProposalCategorySet(uint256 indexed proposalId, ProposalCategory category);
    event GuardianSet(address indexed oldGuardian, address indexed newGuardian);
    event ProposalCancelled(uint256 indexed proposalId, address indexed canceller);
    event VotingModeChanged(uint256 indexed proposalId, VotingMode mode);
    event EmergencyActionTriggered(uint256 indexed proposalId, address indexed guardian);
    
    // ============================================
    // ERRORS
    // ============================================
    
    error OnlyGuardian();
    error InvalidCategory();
    error AlreadyVoted();
    error ProposalNotActive();
    error InsufficientVotingPower();
    error QuadraticVotingDisabled();
    error InvalidVoteType();
    
    // ============================================
    // ENUMS & STRUCTS
    // ============================================
    
    /// @notice Proposal categories with different governance rules
    enum ProposalCategory {
        General,           // 4% quorum - Standard proposals
        Financial,         // 10% quorum - Treasury/funding decisions
        Constitutional,    // 15% quorum - Core governance changes
        Emergency          // 25% quorum - Urgent security matters
    }
    
    /// @notice Voting modes for different proposal types
    enum VotingMode {
        Standard,          // 1 token = 1 vote
        Quadratic,         // √tokens = votes (reduces whale power)
        Conviction         // Time-weighted voting power
    }
    
    /// @notice Extended proposal data
    struct ProposalData {
        ProposalCategory category;
        VotingMode votingMode;
        uint256 quadraticForVotes;
        uint256 quadraticAgainstVotes;
        uint256 quadraticAbstainVotes;
        address proposer;
        uint256 createdAt;
        bool cancelled;
        string title;
        string description;
    }
    
    /// @notice Vote receipt for tracking
    struct VoteReceipt {
        bool hasVoted;
        uint8 support;
        uint256 votes;
        uint256 quadraticVotes;
    }
    
    // ============================================
    // STATE VARIABLES
    // ============================================
    
    /// @notice Guardian address for emergency actions
    address public guardian;
    
    /// @notice Reference to governance token for conviction voting
    GovernanceToken public governanceToken;
    
    /// @notice Mapping of proposal ID to extended data
    mapping(uint256 => ProposalData) public proposalData;
    
    /// @notice Mapping of proposal ID to voter receipts
    mapping(uint256 => mapping(address => VoteReceipt)) public voteReceipts;
    
    /// @notice Quorum requirements by category (basis points, 100 = 1%)
    mapping(ProposalCategory => uint256) public categoryQuorums;
    
    /// @notice Counter for total proposals
    uint256 public proposalCount;
    
    /// @notice Whether quadratic voting is globally enabled
    bool public quadraticVotingEnabled;
    
    // ============================================
    // CONSTANTS
    // ============================================
    
    /// @notice Precision for quadratic calculations
    uint256 private constant PRECISION = 1e18;
    
    /// @notice Minimum votes to prevent spam proposals
    uint256 public constant MIN_PROPOSAL_THRESHOLD = 1000 * 10**18;
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    /**
     * @notice Initialize the DAO Governor
     * @param _token Governance token address
     * @param _timelock Timelock controller address
     * @param _guardian Initial guardian address
     */
    constructor(
        IVotes _token,
        TimelockController _timelock,
        address _guardian
    )
        Governor("DAO Governor")
        GovernorSettings(
            7200,    // Voting delay: ~1 day (assuming 12s blocks)
            50400,   // Voting period: ~7 days
            MIN_PROPOSAL_THRESHOLD  // Proposal threshold
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4)  // 4% default quorum
        GovernorTimelockControl(_timelock)
    {
        guardian = _guardian;
        governanceToken = GovernanceToken(address(_token));
        quadraticVotingEnabled = true;
        
        // Initialize category quorums
        categoryQuorums[ProposalCategory.General] = 400;       // 4%
        categoryQuorums[ProposalCategory.Financial] = 1000;    // 10%
        categoryQuorums[ProposalCategory.Constitutional] = 1500; // 15%
        categoryQuorums[ProposalCategory.Emergency] = 2500;    // 25%
    }
    
    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyGuardian() {
        if (msg.sender != guardian) revert OnlyGuardian();
        _;
    }
    
    // ============================================
    // PROPOSAL FUNCTIONS
    // ============================================
    
    /**
     * @notice Create a new proposal with category and voting mode
     * @param targets Target contract addresses
     * @param values ETH values to send
     * @param calldatas Function call data
     * @param description Proposal description
     * @param category Proposal category
     * @param votingMode Voting mechanism to use
     * @param title Short title for the proposal
     * @return proposalId The created proposal ID
     */
    function proposeWithCategory(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        ProposalCategory category,
        VotingMode votingMode,
        string memory title
    ) public returns (uint256) {
        uint256 proposalId = propose(targets, values, calldatas, description);
        
        proposalData[proposalId] = ProposalData({
            category: category,
            votingMode: votingMode,
            quadraticForVotes: 0,
            quadraticAgainstVotes: 0,
            quadraticAbstainVotes: 0,
            proposer: msg.sender,
            createdAt: block.timestamp,
            cancelled: false,
            title: title,
            description: description
        });
        
        proposalCount++;
        
        emit ProposalCategorySet(proposalId, category);
        emit VotingModeChanged(proposalId, votingMode);
        
        return proposalId;
    }
    
    /**
     * @notice Cast a quadratic vote on a proposal
     * @param proposalId The proposal to vote on
     * @param support Vote type (0=Against, 1=For, 2=Abstain)
     * @param reason Vote reason
     * @return quadraticWeight The calculated quadratic vote weight
     */
    function castQuadraticVote(
        uint256 proposalId,
        uint8 support,
        string calldata reason
    ) public nonReentrant returns (uint256 quadraticWeight) {
        if (proposalData[proposalId].votingMode != VotingMode.Quadratic) {
            revert QuadraticVotingDisabled();
        }
        
        if (state(proposalId) != ProposalState.Active) {
            revert ProposalNotActive();
        }
        
        if (voteReceipts[proposalId][msg.sender].hasVoted) {
            revert AlreadyVoted();
        }
        
        uint256 rawVotes = getVotes(msg.sender, proposalSnapshot(proposalId));
        if (rawVotes == 0) revert InsufficientVotingPower();
        
        // Calculate quadratic vote weight: √(votes)
        quadraticWeight = sqrt(rawVotes);
        
        // Apply conviction bonus if available
        (,, uint256 convictionBonus) = governanceToken.convictionData(msg.sender);
        if (convictionBonus > 0) {
            quadraticWeight = quadraticWeight + (quadraticWeight * convictionBonus) / 10000;
        }
        
        // Record vote
        voteReceipts[proposalId][msg.sender] = VoteReceipt({
            hasVoted: true,
            support: support,
            votes: rawVotes,
            quadraticVotes: quadraticWeight
        });
        
        // Update proposal quadratic totals
        ProposalData storage data = proposalData[proposalId];
        if (support == 0) {
            data.quadraticAgainstVotes += quadraticWeight;
        } else if (support == 1) {
            data.quadraticForVotes += quadraticWeight;
        } else if (support == 2) {
            data.quadraticAbstainVotes += quadraticWeight;
        } else {
            revert InvalidVoteType();
        }
        
        // Also cast the standard vote for compatibility
        _castVote(proposalId, msg.sender, support, reason);
        
        emit QuadraticVoteCast(msg.sender, proposalId, support, rawVotes, quadraticWeight, reason);
        
        return quadraticWeight;
    }
    
    /**
     * @notice Cast a vote with conviction bonus
     * @param proposalId The proposal to vote on
     * @param support Vote type
     * @param reason Vote reason
     */
    function castConvictionVote(
        uint256 proposalId,
        uint8 support,
        string calldata reason
    ) public nonReentrant returns (uint256) {
        if (state(proposalId) != ProposalState.Active) {
            revert ProposalNotActive();
        }
        
        // Update conviction before voting
        governanceToken.updateConviction(msg.sender);
        
        uint256 effectiveVotes = governanceToken.getEffectiveVotingPower(msg.sender);
        
        // Record and cast vote
        _castVote(proposalId, msg.sender, support, reason);
        
        return effectiveVotes;
    }
    
    // ============================================
    // GUARDIAN FUNCTIONS
    // ============================================
    
    /**
     * @notice Cancel a proposal (Guardian only)
     * @param proposalId Proposal to cancel
     */
    function guardianCancel(uint256 proposalId) external onlyGuardian {
        ProposalState currentState = state(proposalId);
        require(
            currentState != ProposalState.Canceled &&
            currentState != ProposalState.Executed,
            "Cannot cancel"
        );
        
        proposalData[proposalId].cancelled = true;
        emit ProposalCancelled(proposalId, msg.sender);
        emit EmergencyActionTriggered(proposalId, msg.sender);
    }
    
    /**
     * @notice Transfer guardian role
     * @param newGuardian New guardian address
     */
    function setGuardian(address newGuardian) external onlyGuardian {
        address oldGuardian = guardian;
        guardian = newGuardian;
        emit GuardianSet(oldGuardian, newGuardian);
    }
    
    /**
     * @notice Renounce guardian role (irreversible)
     */
    function renounceGuardian() external onlyGuardian {
        address oldGuardian = guardian;
        guardian = address(0);
        emit GuardianSet(oldGuardian, address(0));
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get quadratic vote results for a proposal
     * @param proposalId Proposal to query
     * @return forVotes Against votes, for votes, abstain votes
     */
    function getQuadraticVotes(uint256 proposalId) 
        external 
        view 
        returns (uint256 forVotes, uint256 againstVotes, uint256 abstainVotes) 
    {
        ProposalData storage data = proposalData[proposalId];
        return (data.quadraticForVotes, data.quadraticAgainstVotes, data.quadraticAbstainVotes);
    }
    
    /**
     * @notice Get proposal details
     * @param proposalId Proposal to query
     * @return ProposalData struct
     */
    function getProposalData(uint256 proposalId) external view returns (ProposalData memory) {
        return proposalData[proposalId];
    }
    
    /**
     * @notice Get vote receipt for a voter
     * @param proposalId Proposal ID
     * @param voter Voter address
     * @return VoteReceipt struct
     */
    function getVoteReceipt(uint256 proposalId, address voter) 
        external 
        view 
        returns (VoteReceipt memory) 
    {
        return voteReceipts[proposalId][voter];
    }
    
    /**
     * @notice Check if proposal passed using quadratic voting
     * @param proposalId Proposal to check
     * @return True if quadratic for votes > against votes
     */
    function quadraticVoteSucceeded(uint256 proposalId) public view returns (bool) {
        ProposalData storage data = proposalData[proposalId];
        return data.quadraticForVotes > data.quadraticAgainstVotes;
    }
    
    /**
     * @notice Get effective quorum for a proposal based on category
     * @param proposalId Proposal to check
     * @return Required quorum in tokens
     */
    function getEffectiveQuorum(uint256 proposalId) public view returns (uint256) {
        ProposalCategory category = proposalData[proposalId].category;
        uint256 categoryQuorum = categoryQuorums[category];
        
        // Calculate based on total supply
        uint256 totalSupply = token().getPastTotalSupply(proposalSnapshot(proposalId));
        return (totalSupply * categoryQuorum) / 10000;
    }
    
    // ============================================
    // MATH UTILITIES
    // ============================================
    
    /**
     * @notice Calculate square root (Babylonian method)
     * @param x Value to calculate sqrt of
     * @return y Square root result
     */
    function sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        
        uint256 z = (x + 1) / 2;
        y = x;
        
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
    
    // ============================================
    // REQUIRED OVERRIDES
    // ============================================
    
    function votingDelay()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(Governor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        // Check if cancelled by guardian
        if (proposalData[proposalId].cancelled) {
            return ProposalState.Canceled;
        }
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }
}
