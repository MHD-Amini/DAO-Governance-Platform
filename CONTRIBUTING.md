# Contributing to DAO Governance Platform

Thank you for your interest in contributing to the DAO Governance Platform! This document provides guidelines and information about contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/DAO-Governance-Platform.git`
3. Install dependencies: `npm install --legacy-peer-deps`
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Setting Up the Development Environment

```bash
# Install dependencies
npm install --legacy-peer-deps

# Copy environment template
cp .env.example .env

# Compile contracts
npm run compile

# Run tests
npm run test
```

### Code Style

- **Solidity**: Follow the [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- **JavaScript**: Use ES6+ features, consistent formatting
- **Comments**: Use NatSpec for all public functions in Solidity

### Smart Contract Guidelines

1. **Security First**: All changes must maintain or improve security
2. **Gas Optimization**: Consider gas costs for all changes
3. **Test Coverage**: All new code must have corresponding tests
4. **Documentation**: Update NatSpec comments for any modified functions

### Testing Requirements

Before submitting a pull request:

```bash
# Run all tests
npm run test

# Check coverage
npm run test:coverage

# Run gas report
npm run test:gas
```

All tests must pass, and coverage should not decrease.

## Pull Request Process

1. **Update Documentation**: Ensure README.md and code comments are updated
2. **Add Tests**: Include tests for any new functionality
3. **Update CHANGELOG**: Document your changes
4. **Run CI Checks**: Ensure all tests pass locally
5. **Request Review**: Tag maintainers for review

### PR Title Format

```
[TYPE] Brief description

Types:
- [FEAT] New feature
- [FIX] Bug fix
- [DOCS] Documentation changes
- [TEST] Test additions or changes
- [REFACTOR] Code refactoring
- [SECURITY] Security improvements
```

## Security Vulnerabilities

If you discover a security vulnerability, please do NOT open a public issue. Instead:

1. Email: security@example.com
2. Include a detailed description of the vulnerability
3. Provide steps to reproduce if possible
4. Allow time for the team to address the issue before public disclosure

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help maintain a welcoming community

## Questions?

Feel free to open an issue for questions or discussions about contributions.

Thank you for contributing!
