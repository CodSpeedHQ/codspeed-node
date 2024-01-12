import {
  MongoTracer,
  StartInstrumentsRequestBody,
  StartInstrumentsResponse,
} from "./generated/openapi";

export type { StartInstrumentsRequestBody };

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

  public async startInstruments(
    body: StartInstrumentsRequestBody
  ): Promise<StartInstrumentsResponse> {
    if (this.tracerClient === undefined) {
      throw new Error("MongoDB Instrumentation is not enabled");
    }
    return await this.tracerClient.instruments.start(body);
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
