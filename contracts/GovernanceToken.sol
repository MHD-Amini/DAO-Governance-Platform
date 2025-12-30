// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GovernanceToken (DGT - DAO Governance Token)
 * @author MHD-Amini (github.com/MHD-Amini)
 * @notice ERC-20 token with advanced delegation, conviction tracking, and tiered membership
 * @dev Implements ERC20Votes for secure vote tracking and delegation with flash loan protection
 * 
 * @custom:security-contact security@example.com
 * 
 * 
 * KEY FEATURES:
 * - Vote Delegation: Token holders can delegate voting power to any address
 * - Checkpoint System: Historical voting power tracking (prevents flash loan attacks)
 * - EIP-2612 Permit: Gasless token approvals reducing user transaction costs
 * - Conviction Tracking: Up to 10% bonus voting power for long-term holders (365 days)
 * - Tiered Membership: Observer (100), Contributor (1K), Core (10K), Founder (100K)
 * - Soulbound Mode: Non-transferable tokens to prevent vote buying and sybil attacks
 * 
 * SECURITY CONSIDERATIONS:
 * - Checkpoints prevent flash loan voting attacks
 * - Reentrancy guards on minting and burning operations
 * - Max supply cap prevents inflation attacks
 * - Timelock integration for controlled minting
 */
contract GovernanceToken is ERC20, ERC20Permit, ERC20Votes, Ownable, ReentrancyGuard {
    
    // ============================================
    // EVENTS
    // ============================================
    
    event TokensMinted(address indexed to, uint256 amount, MemberTier tier);
    event TokensBurned(address indexed from, uint256 amount);
    event SoulboundStatusChanged(bool isSoulbound);
    event ConvictionBonusUpdated(address indexed holder, uint256 newBonus);
    event MemberTierAssigned(address indexed member, MemberTier tier);
    event TimelockSet(address indexed newTimelock);
    event MaxSupplyUpdated(uint256 newMaxSupply);
    
    // ============================================
    // ERRORS
    // ============================================
    
    error TransfersDisabled();
    error MaxSupplyExceeded();
    error OnlyTimelockAllowed();
    error InvalidAddress();
    error InvalidAmount();
    error InsufficientBalance();
    error TierAlreadyAssigned();
    
    // ============================================
    // ENUMS & STRUCTS
    // ============================================
    
    /// @notice Member tiers with different token allocations and voting weights
    enum MemberTier {
        None,           // 0 - No membership
        Observer,       // 1 - 100 tokens, can vote but not propose
        Contributor,    // 2 - 1,000 tokens, can vote and propose
        CoreMember,     // 3 - 10,000 tokens, enhanced proposal rights
        Founder         // 4 - 100,000 tokens, full governance rights
    }
    
    /// @notice Conviction tracking for long-term holder bonuses
    struct ConvictionData {
        uint256 lastActionTimestamp;  // Last time holder took governance action
        uint256 consecutiveDays;      // Days of continuous holding
        uint256 bonusMultiplier;      // Conviction bonus (basis points, 100 = 1%)
    }
    
    // ============================================
    // STATE VARIABLES
    // ============================================
    
    /// @notice Maximum token supply cap
    uint256 public maxSupply;
    
    /// @notice Address of the Timelock controller (can mint new tokens)
    address public timelock;
    
    /// @notice Whether token transfers are disabled (soulbound mode)
    bool public isSoulbound;
    
    /// @notice Mapping of member tiers
    mapping(address => MemberTier) public memberTiers;
    
    /// @notice Mapping of conviction data for each holder
    mapping(address => ConvictionData) public convictionData;
    
    /// @notice Token amounts for each tier
    mapping(MemberTier => uint256) public tierTokenAmounts;
    
    /// @notice Minimum tokens required for certain actions
    uint256 public constant MIN_PROPOSAL_TOKENS = 1000 * 10**18;
    
    /// @notice Maximum conviction bonus (10% = 1000 basis points)
    uint256 public constant MAX_CONVICTION_BONUS = 1000;
    
    /// @notice Days required for maximum conviction bonus
    uint256 public constant MAX_CONVICTION_DAYS = 365;
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    /**
     * @notice Initialize the governance token
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _maxSupply Maximum supply cap
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _maxSupply
    ) 
        ERC20(_name, _symbol) 
        ERC20Permit(_name) 
        Ownable(msg.sender)
    {
        if (_maxSupply == 0) revert InvalidAmount();
        
        maxSupply = _maxSupply;
        isSoulbound = false;
        
        // Initialize tier token amounts
        tierTokenAmounts[MemberTier.Observer] = 100 * 10**18;
        tierTokenAmounts[MemberTier.Contributor] = 1_000 * 10**18;
        tierTokenAmounts[MemberTier.CoreMember] = 10_000 * 10**18;
        tierTokenAmounts[MemberTier.Founder] = 100_000 * 10**18;
    }
    
    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyTimelock() {
        if (msg.sender != timelock && msg.sender != owner()) {
            revert OnlyTimelockAllowed();
        }
        _;
    }
    
    modifier validAddress(address _addr) {
        if (_addr == address(0)) revert InvalidAddress();
        _;
    }
    
    // ============================================
    // ADMIN FUNCTIONS
    // ============================================
    
    /**
     * @notice Set the timelock controller address
     * @param _timelock Address of the timelock contract
     */
    function setTimelock(address _timelock) external onlyOwner validAddress(_timelock) {
        timelock = _timelock;
        emit TimelockSet(_timelock);
    }
    
    /**
     * @notice Toggle soulbound mode (disable/enable transfers)
     * @param _isSoulbound True to disable transfers, false to enable
     */
    function setSoulbound(bool _isSoulbound) external onlyOwner {
        isSoulbound = _isSoulbound;
        emit SoulboundStatusChanged(_isSoulbound);
    }
    
    /**
     * @notice Update maximum supply (can only increase)
     * @param _newMaxSupply New maximum supply
     */
    function updateMaxSupply(uint256 _newMaxSupply) external onlyOwner {
        if (_newMaxSupply <= maxSupply) revert InvalidAmount();
        maxSupply = _newMaxSupply;
        emit MaxSupplyUpdated(_newMaxSupply);
    }
    
    // ============================================
    // MINTING FUNCTIONS
    // ============================================
    
    /**
     * @notice Mint tokens to an address (only timelock or owner)
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) 
        external 
        onlyTimelock 
        validAddress(to) 
        nonReentrant 
    {
        if (totalSupply() + amount > maxSupply) revert MaxSupplyExceeded();
        _mint(to, amount);
        _initializeConviction(to);
        emit TokensMinted(to, amount, memberTiers[to]);
    }
    
    /**
     * @notice Mint tokens based on member tier
     * @param to Recipient address
     * @param tier Member tier
     */
    function mintByTier(address to, MemberTier tier) 
        external 
        onlyTimelock 
        validAddress(to) 
        nonReentrant 
    {
        if (tier == MemberTier.None) revert InvalidAmount();
        if (memberTiers[to] != MemberTier.None) revert TierAlreadyAssigned();
        
        uint256 amount = tierTokenAmounts[tier];
        if (totalSupply() + amount > maxSupply) revert MaxSupplyExceeded();
        
        memberTiers[to] = tier;
        _mint(to, amount);
        _initializeConviction(to);
        
        emit MemberTierAssigned(to, tier);
        emit TokensMinted(to, amount, tier);
    }
    
    /**
     * @notice Burn tokens from caller's balance
     * @param amount Amount to burn
     */
    function burn(uint256 amount) external nonReentrant {
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance();
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }
    
    // ============================================
    // CONVICTION TRACKING
    // ============================================
    
    /**
     * @notice Initialize conviction data for a new holder
     * @param holder Address to initialize
     */
    function _initializeConviction(address holder) internal {
        if (convictionData[holder].lastActionTimestamp == 0) {
            convictionData[holder] = ConvictionData({
                lastActionTimestamp: block.timestamp,
                consecutiveDays: 0,
                bonusMultiplier: 0
            });
        }
    }
    
    /**
     * @notice Update conviction data when holder takes action
     * @param holder Address to update
     */
    function updateConviction(address holder) external {
        ConvictionData storage data = convictionData[holder];
        
        uint256 daysSinceLastAction = (block.timestamp - data.lastActionTimestamp) / 1 days;
        
        if (daysSinceLastAction <= 1) {
            // Continuous activity - increase conviction
            data.consecutiveDays += daysSinceLastAction;
        } else {
            // Gap in activity - reset streak
            data.consecutiveDays = 0;
        }
        
        // Calculate bonus multiplier (capped at MAX_CONVICTION_BONUS)
        data.bonusMultiplier = (data.consecutiveDays * MAX_CONVICTION_BONUS) / MAX_CONVICTION_DAYS;
        if (data.bonusMultiplier > MAX_CONVICTION_BONUS) {
            data.bonusMultiplier = MAX_CONVICTION_BONUS;
        }
        
        data.lastActionTimestamp = block.timestamp;
        
        emit ConvictionBonusUpdated(holder, data.bonusMultiplier);
    }
    
    /**
     * @notice Get effective voting power including conviction bonus
     * @param holder Address to check
     * @return Effective voting power
     */
    function getEffectiveVotingPower(address holder) external view returns (uint256) {
        uint256 baseVotes = getVotes(holder);
        uint256 bonus = convictionData[holder].bonusMultiplier;
        
        // Apply conviction bonus (basis points)
        return baseVotes + (baseVotes * bonus) / 10000;
    }
    
    /**
     * @notice Get conviction data for a holder
     * @param holder Address to check
     * @return Conviction data struct
     */
    function getConvictionData(address holder) external view returns (ConvictionData memory) {
        return convictionData[holder];
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Check if address can create proposals
     * @param account Address to check
     * @return True if can propose
     */
    function canPropose(address account) external view returns (bool) {
        return getVotes(account) >= MIN_PROPOSAL_TOKENS && 
               memberTiers[account] >= MemberTier.Contributor;
    }
    
    /**
     * @notice Get member tier for an address
     * @param member Address to check
     * @return Member tier
     */
    function getMemberTier(address member) external view returns (MemberTier) {
        return memberTiers[member];
    }
    
    /**
     * @notice Get tier name as string
     * @param tier Tier enum value
     * @return Tier name
     */
    function getTierName(MemberTier tier) external pure returns (string memory) {
        if (tier == MemberTier.Observer) return "Observer";
        if (tier == MemberTier.Contributor) return "Contributor";
        if (tier == MemberTier.CoreMember) return "Core Member";
        if (tier == MemberTier.Founder) return "Founder";
        return "None";
    }
    
    // ============================================
    // OVERRIDES (Required for ERC20Votes)
    // ============================================
    
    /**
     * @notice Override transfer to enforce soulbound restriction
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        // Allow minting (from == 0) and burning (to == 0)
        // Block transfers if soulbound is enabled
        if (isSoulbound && from != address(0) && to != address(0)) {
            revert TransfersDisabled();
        }
        
        super._update(from, to, amount);
    }
    
    /**
     * @notice Override nonces for ERC20Permit
     */
    function nonces(address owner) 
        public 
        view 
        override(ERC20Permit, Nonces) 
        returns (uint256) 
    {
        return super.nonces(owner);
    }
    
    /**
     * @notice Get clock for voting (block number based)
     */
    function clock() public view override returns (uint48) {
        return uint48(block.number);
    }
    
    /**
     * @notice CLOCK_MODE description
     */
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=blocknumber&from=default";
    }
}
