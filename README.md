# Automation Backend

A NestJS-based automation backend service for managing Git repositories, Jira integration, and project automation workflows.

## Features

- **Git Integration**: Support for GitHub and GitLab repositories
- **Jira Integration**: Automated task and project management
- **Secure Configuration**: Environment-based configuration with validation
- **Encryption Service**: Built-in encryption for sensitive data
- **Modular Architecture**: Clean separation of concerns with NestJS modules

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- PostgreSQL (via Docker or local installation)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/sabirmgd/automation-backend.git
cd automation-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Environment Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Application
PORT=3000
NODE_ENV=development

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=automation
DATABASE_USER=your_user
DATABASE_PASSWORD=your_password

# Git Providers
GITHUB_TOKEN=your_github_token
GITLAB_TOKEN=your_gitlab_token

# Jira
JIRA_HOST=your_jira_host
JIRA_EMAIL=your_jira_email
JIRA_API_TOKEN=your_jira_api_token

# Encryption
ENCRYPTION_KEY=your_encryption_key
```

## Development

### Run with Docker Compose (includes PostgreSQL):
```bash
docker-compose up
```

### Run locally:
```bash
# Start development server
npm run start:dev

# Build for production
npm run build

# Start production server
npm run start:prod
```

### Using the start script:
```bash
./start.sh
```

## Project Structure

```
src/
├── app.module.ts           # Root application module
├── main.ts                 # Application entry point
├── config/                 # Configuration and validation
│   ├── index.ts
│   └── validation.schema.ts
├── auth/                   # Authentication module
├── clients/                # External service clients
│   ├── github.client.ts
│   ├── gitlab.client.ts
│   └── jira.client.ts
├── common/                 # Shared services
│   └── services/
│       └── encryption.service.ts
├── git/                    # Git operations module
├── modules/
│   └── jira/              # Jira integration module
├── projects/              # Project management module
└── tasks/                 # Task management module
```

## Testing

```bash
# Unit tests
npm run test

# e2e tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Scripts

- `npm run build` - Build the application
- `npm run start` - Start production server
- `npm run start:dev` - Start development server with hot reload
- `npm run start:prod` - Start production server from built files
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and proprietary.

## Author

Sabir Salah

## Acknowledgments

- Built with [NestJS](https://nestjs.com/)
- Git integration powered by [Octokit](https://github.com/octokit/octokit.js)