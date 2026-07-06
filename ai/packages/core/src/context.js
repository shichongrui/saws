export class RuntimeContext {
    stage;
    rootDir;
    env;
    dryRun;
    logSink;
    currentServiceName;
    constructor(config) {
        assertValidStageName(config.stage);
        this.stage = config.stage;
        this.rootDir = config.rootDir ?? process.cwd();
        this.env = config.env ?? process.env;
        this.dryRun = config.dryRun ?? false;
        this.logSink = config.logSink;
        this.currentServiceName = config.currentServiceName;
    }
    writeLog(chunk, stream = "stdout") {
        this.logSink?.({
            serviceName: this.currentServiceName ?? "system",
            stream,
            chunk,
            timestamp: new Date(),
        });
    }
}
export class InitContext extends RuntimeContext {
}
export class DevContext extends RuntimeContext {
}
export class DeployContext extends RuntimeContext {
}
export class ExitContext extends RuntimeContext {
}
export function assertValidStageName(stage) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(stage)) {
        throw new Error(`Invalid stage "${stage}": stages must start with a lower-case letter or number and contain only lower-case letters, numbers, ".", "_", or "-"`);
    }
}
