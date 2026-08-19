import { createGlobalHost, type HostExposure, type HostPlatform } from "@saws/core";

export interface CreateHostCommandOptions {
  address: string;
  user: string;
  sshPort?: string;
  exposure?: string;
  platform?: string;
  allowedTcpPort?: string[];
}

export async function createHostCommand(name: string, options: CreateHostCommandOptions) {
  const host = await createGlobalHost({
    name,
    address: options.address,
    user: options.user,
    ...(options.sshPort == null ? {} : { sshPort: parsePort(options.sshPort, "SSH port") }),
    ...(options.exposure == null ? {} : { exposure: parseExposure(options.exposure) }),
    ...(options.platform == null ? {} : { platform: options.platform as HostPlatform }),
    ...(options.allowedTcpPort == null
      ? {}
      : {
          allowedTcpPorts: options.allowedTcpPort.map((port) =>
            parsePort(port, "Allowed TCP port"),
          ),
        }),
  });
  console.log(`Created global host "${host.name}" at ${host.address}`);
}

function parsePort(value: string, label: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${label} must be a valid TCP port`);
  }
  return port;
}

function parseExposure(value: string): HostExposure {
  if (value !== "tunnel" && value !== "public") {
    throw new Error('Host exposure must be either "tunnel" or "public"');
  }
  return value;
}
