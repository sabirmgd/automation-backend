export default [
  () => ({
    app: {
      port: parseInt(process.env.PORT || '3000', 10),
      environment: process.env.NODE_ENV || 'development',
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5555',
        credentials: process.env.CORS_CREDENTIALS === 'true',
      },
      rateLimit: {
        ttl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10),
        limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      },
    },
    database: {
      type: 'postgres' as const,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'automation_user',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE || 'automation_db',
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      logging: process.env.DB_LOGGING === 'true',
      migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
      entities: ['dist/**/*.entity{.ts,.js}'],
      migrations: ['dist/database/migrations/*{.ts,.js}'],
      cli: {
        migrationsDir: 'src/database/migrations',
      },
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'default-secret-change-this',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
    github: {
      token: process.env.GITHUB_TOKEN,
    },
    anthropic: {
      apiKey: process.env.COCO_API_KEY,
    },
    encryption: {
      key: process.env.ENCRYPTION_KEY || 'default-32-character-encryption-key-change-this',
    },
  }),
];