import {
  MongoTracer,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
} from "./generated/openapi";

export type { SetupInstrumentsRequestBody };

export class MongoMeasurement {
  private tracerClient: MongoTracer | undefined;

  constructor() {
    const serverUrl = process.env.CODSPEED_MONGO_INSTR_SERVER_ADDRESS;

    if (serverUrl !== undefined) {
      this.tracerClient = new MongoTracer({
        BASE: serverUrl,
      });
    }
  }

  public async setupInstruments(
    body: SetupInstrumentsRequestBody
  ): Promise<SetupInstrumentsResponse> {
    if (this.tracerClient === undefined) {
      throw new Error("MongoDB Instrumentation is not enabled");
    }
    return await this.tracerClient.instruments.setup(body);
  }

  public async start(uri: string) {
    if (this.tracerClient !== undefined) {
      await this.tracerClient.instrumentation.start({
        uri,
      });
    }
  }

  public async stop(uri: string) {
    if (this.tracerClient !== undefined) {
      await this.tracerClient.instrumentation.stop({
        uri,
      });
    }
  }
}
