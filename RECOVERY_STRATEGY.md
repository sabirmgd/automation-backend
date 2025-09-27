# Source Code Recovery Strategy

## Overview
Your NestJS application has been set up with the basic structure. The modules are interdependent, so we'll implement them in a specific order to minimize dependency issues.

## Identified Modules (from dist folder)
1. **Core Configuration** (`/config`)
2. **Common Module** (`/common`) - Shared services like encryption
3. **Database** (`/database`) - TypeORM entities and migrations
4. **Auth Module** (`/auth`) - Authentication and authorization
5. **Clients Module** (`/clients`) - GitHub, GitLab, JIRA integrations
6. **Projects Module** (`/projects`) - Project management
7. **Git Module** (`/git`) - Git repository management
8. **Tasks Module** (`/tasks`) - Task management
9. **JIRA Module** (`/modules/jira`) - JIRA specific functionality
10. **Claude Code** (`/claude-code`) - Claude AI integration

## Implementation Order

### Phase 1: Foundation (Implement First)
1. **Config Module** - Create configuration files
   - Start with `/src/config/index.ts`
   - Add validation schema
   - Environment variables setup

2. **Common Module** - Shared utilities
   - Encryption service
   - Common decorators
   - Shared DTOs

### Phase 2: Database & Auth
3. **Database Setup**
   - TypeORM configuration
   - Base entities
   - Migrations

4. **Auth Module**
   - JWT strategy
   - Local strategy
   - Auth guards
   - User entity

### Phase 3: Core Features
5. **Projects Module**
   - Project entity
   - Project service
   - Project controller

6. **Clients Module**
   - GitHub client
   - GitLab client
   - JIRA client
   - Octokit wrapper

### Phase 4: Advanced Features
7. **Git Module**
   - Git repository entity
   - Pull request entity
   - Git credentials
   - Git service

8. **Tasks Module**
   - Task entity
   - Task links
   - Task service
   - Integration with other modules

### Phase 5: Integrations
9. **JIRA Module**
   - JIRA ticket entity
   - JIRA account entity
   - JIRA service

10. **Claude Code Module**
    - Claude client
    - Examples

## Next Steps

To start recovering a module:

1. **Install dependencies first:**
   ```bash
   cd backend
   npm install
   ```

2. **Start with Config Module:**
   - Look at `backend/dist/config/*.js` files
   - Reverse engineer the TypeScript from the compiled JavaScript
   - Pay attention to imports and exports

3. **For each module:**
   - Create the module folder: `mkdir -p src/[module-name]`
   - Create the module file: `[module-name].module.ts`
   - Recover entities (if any)
   - Recover DTOs
   - Recover services
   - Recover controllers

## How to Reverse Engineer from Dist

Example for a simple service:
1. Open the `.js` file in dist
2. Look for class definitions
3. Identify decorators (@Injectable, @Controller, etc.)
4. Map requires to imports
5. Convert JavaScript to TypeScript syntax
6. Add type annotations based on usage

## Available Commands

After implementation:
```bash
# Install dependencies
npm install

# Run in development mode
npm run start:dev

# Build the project
npm run build

# Run tests
npm test
```

## Tips
- Start small - get one module working completely before moving to the next
- Use the `.d.ts` files in dist for type information
- Check imports carefully - the compiled code shows all dependencies
- Test each module as you implement it
- The app won't fully work until all modules are implemented, but you can comment out missing modules in app.module.ts temporarily