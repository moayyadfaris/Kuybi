import { Global, Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'

import { EventBus, InProcessEventBus } from './event-bus'

@Global()
@Module({
  imports: [EventEmitterModule.forRoot({ wildcard: false, ignoreErrors: false })],
  providers: [{ provide: EventBus, useClass: InProcessEventBus }],
  exports: [EventBus]
})
export class EventsModule {}
