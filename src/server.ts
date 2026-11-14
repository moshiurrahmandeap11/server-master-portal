import app from './app';
import { env } from './app/config/env';
import { prisma } from './app/lib/prisma';

async function bootstrap() {
  try {
    // 1. Verify Database Connection
    await prisma.$connect();
    console.log('✅ Connected to Neon PostgreSQL successfully!');

    // 2. Start HTTP Server
    const server = app.listen(env.PORT, () => {
      console.log('====================================================');
      console.log(`🚀 Chakri Sheba Backend Server Started!`);
      console.log(`📡 Architecture: Avirosoft Modular Pattern`);
      console.log(`📡 Listening on: http://localhost:${env.PORT}`);
      console.log(`🔗 API Base:    http://localhost:${env.PORT}/api`);
      console.log(`📂 Uploads:     http://localhost:${env.PORT}/uploads`);
      console.log(`❤️  Health:      http://localhost:${env.PORT}/health`);
      console.log('====================================================');
    });

    // 3. Graceful Shutdown
    const exitHandler = () => {
      if (server) {
        server.close(async () => {
          console.log('🛑 Server closed gracefully');
          await prisma.$disconnect();
          process.exit(1);
        });
      } else {
        process.exit(1);
      }
    };

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      exitHandler();
    });

    process.on('unhandledRejection', (error) => {
      console.error('Unhandled Rejection:', error);
      exitHandler();
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM received');
      if (server) {
        server.close();
      }
    });
  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

bootstrap();
