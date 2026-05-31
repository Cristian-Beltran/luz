import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/monitoring',
  cors: { origin: true, credentials: true },
})
export class MonitoringGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  handleConnection(_client: Socket) {}

  handleDisconnect(_client: Socket) {}

  emitTelemetry(sessionId: string, payload: Record<string, unknown>) {
    const message = Object.assign({ sessionId }, payload);
    this.server.emit('telemetry', message);
  }
}
