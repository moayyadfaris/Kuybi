import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger, PinoLogger } from 'nestjs-pino'
import { ConfigService } from '@nestjs/config'
import helmet from 'helmet'
import * as compression from 'compression'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { LoggingContextService } from './logging/logging-context.service'
import { LoggingContextInterceptor } from './logging/logging-context.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  const configService = app.get(ConfigService)
  const httpConfig = configService.get('http', {
    host: '0.0.0.0',
    port: 4040,
    corsOrigin: '*',
  })

  // Set Pino as the application logger
  const appLogger = app.get(Logger)
  app.useLogger(appLogger)

  app.use(helmet())
  app.use(compression())
  app.enableCors({ origin: httpConfig.corsOrigin, credentials: true })
  app.setGlobalPrefix('api')
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  )
  const pinoLogger = appLogger as unknown as PinoLogger
  app.useGlobalFilters(new HttpExceptionFilter(pinoLogger, configService))

  const loggingContextService = app.get(LoggingContextService)
  app.useGlobalInterceptors(
    new LoggingContextInterceptor(loggingContextService, configService),
    new TransformInterceptor(),
  )

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Susanoo Countries API')
    .setDescription('Country listing endpoints for the NestJS scaffold')
    .setVersion('1.0.0')
    .addServer(`http://${httpConfig.host}:${httpConfig.port}`)
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/swagger.json'
  })

  app.use('/api/swagger.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(document)
  })

  await app.listen(httpConfig.port, httpConfig.host)
}

bootstrap()
