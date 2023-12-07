import { MongoTracer } from "./generated/openapi";

export class MongoMeasurement {
  private tracerClient: MongoTracer | undefined;

  constructor() {
    const serverUrl = process.env.CODSPEED_MONGO_INSTR_SERVER_ADDRESS;
    // TODO
    const mongoUriEnvName = process.env.CODSPEED_MONGO_INSTR_URI_ENV_NAME;
    if (mongoUriEnvName === undefined) {
      throw new Error("CODSPEED_MONGO_INSTR_URI_ENV_NAME is not defined");
    }
    const mongoUri = process.env[mongoUriEnvName];
    if (mongoUri === undefined) {
      throw new Error(`Environment variable ${mongoUriEnvName} is not defined`);
    }
    process.env[mongoUriEnvName] =
      "mongodb://localhost:27018?directConnection=true";

    if (serverUrl !== undefined) {
      this.tracerClient = new MongoTracer({
        BASE: serverUrl,
      });
    }
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
