# Testing Suite Documentation

## Overview
Comprehensive testing suite for the ParkEasy parking management system, covering all major components and features.

## Test Structure

### Backend Tests (`/backend/tests/`)

#### Unit Tests (`/unit/`)
- **database.test.js**: Database operations, validation functions, table existence
- **autocheckout.test.js**: AutoCheckoutManager class methods and edge cases

#### Integration Tests (`/integration/`)
- **api.test.js**: Full API endpoint testing with authentication, CRUD operations, and error handling

#### Performance Tests (`/performance/`)
- **load.test.js**: Load testing, concurrent requests, memory usage, and response times

### Frontend Tests (`/frontend/src/__tests__/`)

#### Unit Tests
- **AutoCheckout.test.js**: Auto-checkout component functionality
- **SearchFilters.test.js**: Search and filter component behavior
- **api.test.js**: API utility functions and error handling
- **testUtils.js**: Shared testing utilities and mocks

#### E2E Tests (`/frontend/e2e/`)
- **parking.spec.js**: Basic smoke tests for map and sidebar
- **comprehensive.spec.js**: Full feature testing including auto-checkout, search, comparison, reminders, support, and PWA features

## Running Tests

### Backend Tests
```bash
cd backend

# Run all tests
npm test

# Run specific test types
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:performance    # Performance tests only

# Development
npm run test:watch         # Watch mode for development
npm run test:coverage      # Generate coverage report
npm run test:all          # Run all test categories
```

### Frontend Tests
```bash
cd frontend

# Run unit tests
npm test                  # Single run
npm run test:unit        # Unit tests only
npm run test:watch       # Watch mode
npm run test:coverage    # Generate coverage report

# Run E2E tests
npm run e2e:install      # Install Playwright browsers
npm run e2e:test         # Run E2E tests (Chromium only)
npm run e2e:test:all     # Run on all browsers
npm run e2e:test:headed  # Run with visible browser
npm run e2e:report       # View test report
```

## Test Categories

### 1. Unit Tests
- **Scope**: Individual functions and components
- **Speed**: Fast (< 100ms per test)
- **Coverage**: Validation functions, utility methods, component rendering
- **Mocking**: External dependencies, API calls, browser APIs

### 2. Integration Tests
- **Scope**: API endpoints with database
- **Speed**: Medium (100ms - 1s per test)
- **Coverage**: Full request/response cycles, authentication, CRUD operations
- **Database**: Uses test database with cleanup

### 3. Performance Tests
- **Scope**: Response times, concurrent requests, memory usage
- **Speed**: Slow (1s - 10s per test)
- **Coverage**: Load testing, memory leak detection, database performance
- **Thresholds**: Response times < 500ms, memory usage monitoring

### 4. End-to-End Tests
- **Scope**: Complete user workflows
- **Speed**: Slowest (5s - 30s per test)
- **Coverage**: User interactions, cross-browser compatibility, PWA features
- **Browser**: Chromium, Firefox, Safari (via Playwright)

## Test Configuration

### Jest Configuration (`backend/tests/jest.config.js`)
```javascript
module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.js'],
  coverageDirectory: 'coverage',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000
};
```

### Playwright Configuration (`frontend/e2e/playwright.config.js`)
- Multiple browser support (Chromium, Firefox, WebKit)
- Mobile viewport testing
- Video recording on failure
- Screenshot capture

## Mocking Strategy

### Frontend Mocks
- **Fetch API**: Complete request/response mocking
- **Geolocation API**: Position simulation
- **ResizeObserver/IntersectionObserver**: Browser API mocks
- **LocalStorage/SessionStorage**: Storage API mocks

### Backend Mocks
- **Database**: In-memory SQLite for tests
- **Email Service**: Mock transporter for notifications
- **External APIs**: Stripe, payment gateways

## Coverage Goals

### Backend Coverage Targets
- **Unit Tests**: > 80% line coverage
- **Integration Tests**: All API endpoints covered
- **Performance Tests**: Critical paths tested

### Frontend Coverage Targets
- **Components**: > 70% coverage for major components
- **Utilities**: > 90% coverage for utility functions
- **User Flows**: All major workflows covered in E2E

## Test Data Management

### Backend Test Data
- **Dynamic Generation**: Unique emails, timestamps
- **Cleanup**: Automatic test data removal
- **Isolation**: Each test uses fresh data

### Frontend Test Data
- **Mock Responses**: Consistent API response mocking
- **User Scenarios**: Predefined user personas
- **Edge Cases**: Invalid data handling

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd backend && npm ci
      - run: cd backend && npm run test:all
      
  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd frontend && npm ci
      - run: cd frontend && npm run test:coverage
      - run: cd frontend && npm run e2e:test
```

## Test Best Practices

### 1. Test Naming
- **Descriptive**: Clear test descriptions
- **Behavior-focused**: Test what, not how
- **Consistent**: Follow naming conventions

### 2. Test Structure
- **Arrange**: Set up test data
- **Act**: Execute the functionality
- **Assert**: Verify expected outcomes

### 3. Test Independence
- **Isolation**: Tests don't depend on each other
- **Cleanup**: Proper teardown after tests
- **Deterministic**: Consistent results

### 4. Error Testing
- **Happy Path**: Normal operation scenarios
- **Edge Cases**: Boundary conditions
- **Error Conditions**: Failure scenarios

## Debugging Tests

### Backend Debugging
```bash
# Run single test file
npm test -- database.test.js

# Run with debug output
npm test -- --verbose

# Run specific test
npm test -- --testNamePattern="should validate email"
```

### Frontend Debugging
```bash
# Run specific test file
npm test AutoCheckout.test.js

# Debug mode
npm test -- --no-watch --verbose

# E2E debugging
npm run e2e:test:headed
```

## Metrics and Reporting

### Coverage Reports
- **Location**: `backend/coverage/` and `frontend/coverage/`
- **Format**: HTML reports with line-by-line coverage
- **CI Integration**: Coverage badges and PR comments

### Performance Metrics
- **Response Times**: API endpoint performance tracking
- **Memory Usage**: Heap usage monitoring
- **Concurrent Load**: Multi-user simulation results

### E2E Reports
- **Screenshots**: Failure screenshots automatically captured
- **Videos**: Test execution recordings
- **Trace Files**: Detailed execution traces for debugging

## Maintenance

### Regular Tasks
- **Update Dependencies**: Keep testing libraries current
- **Review Coverage**: Identify uncovered code paths
- **Performance Baselines**: Update performance thresholds
- **Test Cleanup**: Remove obsolete tests

### Test Quality Checks
- **Flaky Test Detection**: Monitor test stability
- **Test Execution Time**: Optimize slow tests
- **False Positive Prevention**: Ensure test reliability