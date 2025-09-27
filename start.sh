#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory of the script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables
if [ -f "$DIR/.env" ]; then
    export $(cat "$DIR/.env" | sed 's/#.*//g' | xargs)
else
    echo -e "${RED}[ERROR]${NC} .env file not found in $DIR"
    exit 1
fi

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if PostgreSQL is ready
wait_for_postgres() {
    print_info "Waiting for PostgreSQL to be ready..."
    local retries=30
    while [ $retries -gt 0 ]; do
        if docker exec automation_postgres pg_isready -U $DB_USERNAME -d $DB_DATABASE &>/dev/null; then
            print_success "PostgreSQL is ready!"
            return 0
        fi
        retries=$((retries - 1))
        echo -n "."
        sleep 1
    done
    echo
    print_error "PostgreSQL failed to start in time"
    return 1
}

# Main execution
cd "$DIR"

print_info "Starting Automation Backend Services..."
echo

# Check if Docker is running
if ! docker info &>/dev/null; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

# Stop any existing containers
print_info "Stopping any existing containers..."
docker-compose down &>/dev/null || docker compose down &>/dev/null

# Start PostgreSQL with docker-compose
print_info "Starting PostgreSQL database..."
docker-compose up -d postgres || docker compose up -d postgres

# Wait for PostgreSQL to be ready
if ! wait_for_postgres; then
    print_error "Failed to start PostgreSQL"
    docker-compose logs postgres || docker compose logs postgres
    exit 1
fi

# Optional: Start PgAdmin
read -p "Do you want to start PgAdmin? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Starting PgAdmin..."
    docker-compose up -d pgadmin || docker compose up -d pgadmin
    print_success "PgAdmin started at http://localhost:5050"
    print_info "Login with: admin@automation.local / ${DB_PASSWORD}"
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_info "Installing dependencies..."
    npm install
fi

# Run database migrations if needed
if [ "$DB_MIGRATIONS_RUN" = "true" ]; then
    print_info "Running database migrations..."
    npm run typeorm:migration:run 2>/dev/null || print_warning "No migrations to run or migrations not configured yet"
fi

# Start the NestJS application
print_info "Starting NestJS application in development mode..."
print_success "Backend API will be available at http://localhost:${PORT}"
echo
print_info "Press Ctrl+C to stop all services"
echo

# Start the application
npm run start:dev