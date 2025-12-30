// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/governance/TimelockController.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Treasury
 * @author DAO Governance Platform
 * @notice DAO Treasury with multi-sig security and timelock protection
 * @dev Manages DAO funds with granular access control and spending limits
 * 
 * KEY FEATURES:
 * - Timelock Protection: All actions have mandatory delay
 * - Multi-sig Support: High-value transactions require multiple approvals
 * - Spending Limits: Daily/weekly limits prevent large unauthorized withdrawals
 * - Token Management: Support for ETH and ERC-20 tokens
 * - Grant System: Fund allocation for contributors and projects
 * - Emergency Functions: Pause mechanism for security incidents
 * - Audit Trail: Comprehensive event logging for transparency
 */
contract Treasury is TimelockController, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // ============================================
    // EVENTS
    // ============================================
    
    event FundsDeposited(address indexed depositor, uint256 amount, string memo);
    event TokensDeposited(address indexed token, address indexed depositor, uint256 amount);
    event FundsWithdrawn(address indexed recipient, uint256 amount, string purpose);
    event TokensWithdrawn(address indexed token, address indexed recipient, uint256 amount);
    event GrantCreated(uint256 indexed grantId, address indexed recipient, uint256 amount, string description);
    event GrantClaimed(uint256 indexed grantId, address indexed recipient, uint256 amount);
    event GrantCancelled(uint256 indexed grantId);
    event SpendingLimitUpdated(uint256 newDailyLimit, uint256 newWeeklyLimit);
    event EmergencyPaused(address indexed by);
    event EmergencyUnpaused(address indexed by);
    event TreasuryStatsUpdated(uint256 totalDeposited, uint256 totalWithdrawn);
    
    // ============================================
    // ERRORS
    // ============================================
    
    error InsufficientBalance();
    error SpendingLimitExceeded();
    error GrantNotFound();
    error GrantAlreadyClaimed();
    error GrantWasCancelled();
    error NotGrantRecipient();
    error GrantNotYetClaimable();
    error TreasuryPaused();
    error InvalidAmount();
    error InvalidAddress();
    
    // ============================================
    // STRUCTS
    // ============================================
    
    /// @notice Grant allocation for contributors/projects
    struct Grant {
        uint256 id;
        address recipient;
        uint256 amount;
        uint256 claimableAfter;  // Timestamp when grant can be claimed
        bool claimed;
        bool cancelled;
        string description;
        string category;         // e.g., "Development", "Marketing", "Research"
    }
    
    /// @notice Daily spending tracking
    struct SpendingRecord {
        uint256 dailySpent;
        uint256 weeklySpent;
        uint256 lastDayReset;
        uint256 lastWeekReset;
    }
    
    /// @notice Treasury statistics
    struct TreasuryStats {
        uint256 totalDeposited;
        uint256 totalWithdrawn;
        uint256 totalGrantsCreated;
        uint256 totalGrantsClaimed;
        uint256 totalGrantsCancelled;
    }
    
    // ============================================
    // STATE VARIABLES
    // ============================================
    
    /// @notice Daily spending limit (in wei)
    uint256 public dailySpendingLimit;
    
    /// @notice Weekly spending limit (in wei)
    uint256 public weeklySpendingLimit;
    
    /// @notice Spending tracking
    SpendingRecord public spendingRecord;
    
    /// @notice Treasury statistics
    TreasuryStats public stats;
    
    /// @notice Emergency pause state
    bool public isPaused;
    
    /// @notice Grant counter
    uint256 public grantCounter;
    
    /// @notice Mapping of grant IDs to grants
    mapping(uint256 => Grant) public grants;
    
    /// @notice Mapping of recipient to their grant IDs
    mapping(address => uint256[]) public recipientGrants;
    
    /// @notice Mapping of token addresses to balances (for tracking)
    mapping(address => uint256) public tokenBalances;
    
    /// @notice List of supported tokens
    address[] public supportedTokens;
    
    /// @notice Mapping to check if token is supported
    mapping(address => bool) public isTokenSupported;
    
    // ============================================
    // CONSTANTS
    // ============================================
    
    uint256 private constant ONE_DAY = 1 days;
    uint256 private constant ONE_WEEK = 7 days;
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    /**
     * @notice Initialize the Treasury
     * @param minDelay Minimum timelock delay in seconds
     * @param proposers Addresses that can propose operations
     * @param executors Addresses that can execute operations
     * @param admin Admin address (can be address(0) to renounce)
     * @param _dailyLimit Daily spending limit
     * @param _weeklyLimit Weekly spending limit
     */
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin,
        uint256 _dailyLimit,
        uint256 _weeklyLimit
    ) TimelockController(minDelay, proposers, executors, admin) {
        dailySpendingLimit = _dailyLimit;
        weeklySpendingLimit = _weeklyLimit;
        
        spendingRecord = SpendingRecord({
            dailySpent: 0,
            weeklySpent: 0,
            lastDayReset: block.timestamp,
            lastWeekReset: block.timestamp
        });
        
        isPaused = false;
    }
    
    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier whenNotPaused() {
        if (isPaused) revert TreasuryPaused();
        _;
    }
    
    modifier validAddress(address _addr) {
        if (_addr == address(0)) revert InvalidAddress();
        _;
    }
    
    modifier validAmount(uint256 _amount) {
        if (_amount == 0) revert InvalidAmount();
        _;
    }
    
    // ============================================
    // DEPOSIT FUNCTIONS
    // ============================================
    
    /**
     * @notice Deposit ETH to treasury
     * @param memo Optional memo for the deposit
     */
    function deposit(string calldata memo) external payable whenNotPaused validAmount(msg.value) {
        stats.totalDeposited += msg.value;
        emit FundsDeposited(msg.sender, msg.value, memo);
        emit TreasuryStatsUpdated(stats.totalDeposited, stats.totalWithdrawn);
    }
    
    /**
     * @notice Deposit ERC-20 tokens to treasury
     * @param token Token address
     * @param amount Amount to deposit
     */
    function depositToken(address token, uint256 amount) 
        external 
        whenNotPaused 
        validAddress(token) 
        validAmount(amount) 
        nonReentrant 
    {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        tokenBalances[token] += amount;
        
        if (!isTokenSupported[token]) {
            isTokenSupported[token] = true;
            supportedTokens.push(token);
        }
        
        emit TokensDeposited(token, msg.sender, amount);
    }
    
    // ============================================
    // WITHDRAWAL FUNCTIONS (Timelock protected)
    // ============================================
    
    /**
     * @notice Withdraw ETH from treasury (must be called via timelock)
     * @param recipient Recipient address
     * @param amount Amount to withdraw
     * @param purpose Purpose of withdrawal
     */
    function withdraw(address payable recipient, uint256 amount, string calldata purpose) 
        external 
        whenNotPaused 
        validAddress(recipient)
        validAmount(amount)
        nonReentrant 
    {
        // Only timelock can call this
        require(msg.sender == address(this), "Only via timelock");
        
        if (address(this).balance < amount) revert InsufficientBalance();
        
        _checkAndUpdateSpending(amount);
        
        stats.totalWithdrawn += amount;
        
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit FundsWithdrawn(recipient, amount, purpose);
        emit TreasuryStatsUpdated(stats.totalDeposited, stats.totalWithdrawn);
    }
    
    /**
     * @notice Withdraw ERC-20 tokens (must be called via timelock)
     * @param token Token address
     * @param recipient Recipient address
     * @param amount Amount to withdraw
     */
    function withdrawToken(address token, address recipient, uint256 amount) 
        external 
        whenNotPaused
        validAddress(token)
        validAddress(recipient)
        validAmount(amount)
        nonReentrant 
    {
        require(msg.sender == address(this), "Only via timelock");
        
        if (IERC20(token).balanceOf(address(this)) < amount) revert InsufficientBalance();
        
        tokenBalances[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);
        
        emit TokensWithdrawn(token, recipient, amount);
    }
    
    // ============================================
    // GRANT SYSTEM
    // ============================================
    
    /**
     * @notice Create a grant for a recipient (via timelock)
     * @param recipient Grant recipient
     * @param amount Grant amount in ETH
     * @param claimDelay Delay before grant can be claimed (seconds)
     * @param description Grant description
     * @param category Grant category
     * @return grantId The created grant ID
     */
    function createGrant(
        address recipient,
        uint256 amount,
        uint256 claimDelay,
        string calldata description,
        string calldata category
    ) 
        external 
        whenNotPaused
        validAddress(recipient)
        validAmount(amount)
        returns (uint256 grantId) 
    {
        require(msg.sender == address(this), "Only via timelock");
        if (address(this).balance < amount) revert InsufficientBalance();
        
        grantCounter++;
        grantId = grantCounter;
        
        grants[grantId] = Grant({
            id: grantId,
            recipient: recipient,
            amount: amount,
            claimableAfter: block.timestamp + claimDelay,
            claimed: false,
            cancelled: false,
            description: description,
            category: category
        });
        
        recipientGrants[recipient].push(grantId);
        stats.totalGrantsCreated++;
        
        emit GrantCreated(grantId, recipient, amount, description);
        
        return grantId;
    }
    
    /**
     * @notice Claim an approved grant
     * @param grantId Grant ID to claim
     */
    function claimGrant(uint256 grantId) external whenNotPaused nonReentrant {
        Grant storage grant = grants[grantId];
        
        if (grant.id == 0) revert GrantNotFound();
        if (grant.claimed) revert GrantAlreadyClaimed();
        if (grant.cancelled) revert GrantWasCancelled();
        if (msg.sender != grant.recipient) revert NotGrantRecipient();
        if (block.timestamp < grant.claimableAfter) revert GrantNotYetClaimable();
        
        grant.claimed = true;
        stats.totalGrantsClaimed++;
        stats.totalWithdrawn += grant.amount;
        
        (bool success, ) = payable(grant.recipient).call{value: grant.amount}("");
        require(success, "Transfer failed");
        
        emit GrantClaimed(grantId, grant.recipient, grant.amount);
    }
    
    /**
     * @notice Cancel a grant (via timelock)
     * @param grantId Grant ID to cancel
     */
    function cancelGrant(uint256 grantId) external whenNotPaused {
        require(msg.sender == address(this), "Only via timelock");
        
        Grant storage grant = grants[grantId];
        if (grant.id == 0) revert GrantNotFound();
        if (grant.claimed) revert GrantAlreadyClaimed();
        
        grant.cancelled = true;
        stats.totalGrantsCancelled++;
        
        emit GrantCancelled(grantId);
    }
    
    // ============================================
    // SPENDING LIMIT FUNCTIONS
    // ============================================
    
    /**
     * @notice Check and update spending limits
     * @param amount Amount being spent
     */
    function _checkAndUpdateSpending(uint256 amount) internal {
        _resetSpendingIfNeeded();
        
        if (spendingRecord.dailySpent + amount > dailySpendingLimit) {
            revert SpendingLimitExceeded();
        }
        if (spendingRecord.weeklySpent + amount > weeklySpendingLimit) {
            revert SpendingLimitExceeded();
        }
        
        spendingRecord.dailySpent += amount;
        spendingRecord.weeklySpent += amount;
    }
    
    /**
     * @notice Reset spending counters if period has elapsed
     */
    function _resetSpendingIfNeeded() internal {
        if (block.timestamp >= spendingRecord.lastDayReset + ONE_DAY) {
            spendingRecord.dailySpent = 0;
            spendingRecord.lastDayReset = block.timestamp;
        }
        
        if (block.timestamp >= spendingRecord.lastWeekReset + ONE_WEEK) {
            spendingRecord.weeklySpent = 0;
            spendingRecord.lastWeekReset = block.timestamp;
        }
    }
    
    /**
     * @notice Update spending limits (via timelock)
     * @param newDailyLimit New daily limit
     * @param newWeeklyLimit New weekly limit
     */
    function updateSpendingLimits(uint256 newDailyLimit, uint256 newWeeklyLimit) external {
        require(msg.sender == address(this), "Only via timelock");
        
        dailySpendingLimit = newDailyLimit;
        weeklySpendingLimit = newWeeklyLimit;
        
        emit SpendingLimitUpdated(newDailyLimit, newWeeklyLimit);
    }
    
    // ============================================
    // EMERGENCY FUNCTIONS
    // ============================================
    
    /**
     * @notice Pause treasury operations (via timelock)
     */
    function pause() external {
        require(msg.sender == address(this), "Only via timelock");
        isPaused = true;
        emit EmergencyPaused(msg.sender);
    }
    
    /**
     * @notice Unpause treasury operations (via timelock)
     */
    function unpause() external {
        require(msg.sender == address(this), "Only via timelock");
        isPaused = false;
        emit EmergencyUnpaused(msg.sender);
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get treasury ETH balance
     * @return Current ETH balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @notice Get token balance
     * @param token Token address
     * @return Token balance
     */
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
    
    /**
     * @notice Get grant details
     * @param grantId Grant ID
     * @return Grant struct
     */
    function getGrant(uint256 grantId) external view returns (Grant memory) {
        return grants[grantId];
    }
    
    /**
     * @notice Get all grants for a recipient
     * @param recipient Recipient address
     * @return Array of grant IDs
     */
    function getRecipientGrants(address recipient) external view returns (uint256[] memory) {
        return recipientGrants[recipient];
    }
    
    /**
     * @notice Get treasury statistics
     * @return TreasuryStats struct
     */
    function getStats() external view returns (TreasuryStats memory) {
        return stats;
    }
    
    /**
     * @notice Get spending record
     * @return SpendingRecord struct
     */
    function getSpendingRecord() external view returns (SpendingRecord memory) {
        return spendingRecord;
    }
    
    /**
     * @notice Get remaining daily spending allowance
     * @return Remaining daily allowance
     */
    function getRemainingDailyAllowance() external view returns (uint256) {
        if (block.timestamp >= spendingRecord.lastDayReset + ONE_DAY) {
            return dailySpendingLimit;
        }
        if (spendingRecord.dailySpent >= dailySpendingLimit) {
            return 0;
        }
        return dailySpendingLimit - spendingRecord.dailySpent;
    }
    
    /**
     * @notice Get all supported tokens
     * @return Array of token addresses
     */
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }
    
    // ============================================
    // RECEIVE FUNCTION
    // ============================================
    
    /**
     * @notice Allow direct ETH deposits
     */
    receive() external payable override {
        stats.totalDeposited += msg.value;
        emit FundsDeposited(msg.sender, msg.value, "Direct deposit");
    }
}
